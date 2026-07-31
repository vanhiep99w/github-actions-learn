---
title: "Docker container actions"
description: "Thiết kế, kiểm thử, bảo mật và phát hành GitHub Action chạy trong Docker container trên Linux."
---

<Callout type="info" title="Kết quả sau bài này">
  Bạn sẽ hiểu khi nào nên dùng Docker container action và xây dựng được một action hoàn chỉnh gồm `action.yml`, `Dockerfile`, `entrypoint.sh` và workflow kiểm thử. Ví dụ tạo báo cáo inventory trong workspace, công bố output qua `GITHUB_OUTPUT`, xử lý quyền sở hữu file và có thể kiểm thử bằng Docker trước khi push.
</Callout>

## Mục lục

- [Docker container action là gì](#docker-container-action-là-gì)
  - [Luồng thực thi](#luồng-thực-thi)
  - [Khi nào nên dùng](#khi-nào-nên-dùng)
  - [Giới hạn nền tảng](#giới-hạn-nền-tảng)
- [Cấu trúc một Docker container action](#cấu-trúc-một-docker-container-action)
  - [Cây thư mục](#cây-thư-mục)
  - [Vai trò của từng file](#vai-trò-của-từng-file)
- [Metadata cho container](#metadata-cho-container)
  - [runs.image](#runsimage)
  - [runs.args](#runsargs)
  - [runs.env](#runsenv)
  - [ENTRYPOINT CMD và metadata override](#entrypoint-cmd-và-metadata-override)
  - [Pre và post entrypoint](#pre-và-post-entrypoint)
- [Inputs outputs và workflow commands](#inputs-outputs-và-workflow-commands)
  - [Nhận input](#nhận-input)
  - [Tạo output bằng GITHUB_OUTPUT](#tạo-output-bằng-github_output)
  - [Log annotation và exit code](#log-annotation-và-exit-code)
- [Workspace và filesystem](#workspace-và-filesystem)
  - [Các thư mục được mount](#các-thư-mục-được-mount)
  - [Dữ liệu nào tồn tại sau action](#dữ-liệu-nào-tồn-tại-sau-action)
  - [UID và permissions](#uid-và-permissions)
- [Network của container action](#network-của-container-action)
  - [Kết nối ra ngoài](#kết-nối-ra-ngoài)
  - [Service container và localhost](#service-container-và-localhost)
- [Ví dụ end-to-end](#ví-dụ-end-to-end)
  - [Mục tiêu và hợp đồng](#mục-tiêu-và-hợp-đồng)
  - [action.yml hoàn chỉnh](#actionyml-hoàn-chỉnh)
  - [Dockerfile hoàn chỉnh](#dockerfile-hoàn-chỉnh)
  - [entrypoint.sh hoàn chỉnh](#entrypointsh-hoàn-chỉnh)
  - [Workflow gọi local action](#workflow-gọi-local-action)
  - [Gọi action đã phát hành](#gọi-action-đã-phát-hành)
- [Build và kiểm thử local](#build-và-kiểm-thử-local)
  - [Build image](#build-image)
  - [Mô phỏng môi trường runner](#mô-phỏng-môi-trường-runner)
  - [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Build từ Dockerfile hay dùng docker URI](#build-từ-dockerfile-hay-dùng-docker-uri)
  - [Image build từ repository action](#image-build-từ-repository-action)
  - [Image có sẵn từ registry](#image-có-sẵn-từ-registry)
  - [Hiệu năng và cache](#hiệu-năng-và-cache)
- [Bảo mật và chuỗi cung ứng](#bảo-mật-và-chuỗi-cung-ứng)
  - [Base image và dependencies](#base-image-và-dependencies)
  - [Input secret và quyền của runner](#input-secret-và-quyền-của-runner)
  - [Docker socket và ranh giới tin cậy](#docker-socket-và-ranh-giới-tin-cậy)
- [Release và versioning](#release-và-versioning)
  - [Version repository action](#version-repository-action)
  - [Version image registry](#version-image-registry)
- [Bài thực hành](#bài-thực-hành)
  - [Các bước thực hiện](#các-bước-thực-hiện)
  - [Checklist hoàn thành](#checklist-hoàn-thành)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Nguồn chính thức](#nguồn-chính-thức)
- [Tiếp tục trong series](#tiếp-tục-trong-series)

## Docker container action là gì

**Docker container action** là một custom action mà GitHub Actions thực thi trong một container Linux. Tác giả action quyết định base image, hệ điều hành user space, runtime, binary và dependency được đóng gói trong image. Workflow gọi action bằng một step `uses`, giống JavaScript action hoặc composite action:

```yaml
- name: Kiểm kê repository
  uses: OWNER/repository-inventory-action@v1
```

Ranh giới container giúp môi trường chạy nhất quán hơn, nhưng không biến action thành sandbox bảo mật. Action vẫn có thể đọc workspace, biến môi trường và các credential mà step nhận được. Hãy xem nó như một chương trình bên thứ ba chạy trong job.

### Luồng thực thi

```text
Workflow dùng uses
        │
        ▼
Runner tải repository action tại ref
        │
        ▼
Đọc action.yml và xác định runs.using: docker
        │
        ├── image: Dockerfile ──► docker build trên runner
        │
        └── image: docker://... ─► dùng/pull image từ registry
        │
        ▼
Mount workspace và các file command vào container
        │
        ▼
Chạy ENTRYPOINT với runs.args và runs.env
        │
        ├── ghi file vào workspace
        ├── ghi output vào GITHUB_OUTPUT
        └── trả exit code
```

Với `image: Dockerfile`, GitHub build image trước mỗi lần action được thực thi trên runner chưa có cache phù hợp. Với `image: docker://...`, runner bỏ qua bước build và chạy image công khai đã được phát hành.

### Khi nào nên dùng

Docker container action phù hợp khi action cần một hoặc nhiều yếu tố sau:

- binary native, compiler hoặc toolchain khó cài nhất quán trên runner;
- phiên bản hệ điều hành user space và thư viện hệ thống cố định;
- runtime không được JavaScript action hỗ trợ trực tiếp;
- dependency lớn hoặc có quá trình cài đặt phức tạp;
- hành vi chỉ cần hỗ trợ Linux;
- một CLI hiện có đã được đóng gói thành image và cần bọc lại bằng interface `inputs`/`outputs`.

Ví dụ điển hình là scanner bảo mật, trình biên dịch tài liệu, generator mã nguồn, công cụ phân tích binary hoặc linter phụ thuộc thư viện hệ thống cụ thể.

Không nên chọn container chỉ vì muốn chạy vài lệnh shell. Composite action thường khởi động nhanh hơn và dùng trực tiếp công cụ trên runner. JavaScript action phù hợp hơn khi cần đa nền tảng, gọi API, parse dữ liệu hoặc logic phức tạp nhưng không cần user space riêng.

| Nhu cầu | Composite action | JavaScript action | Docker container action |
|---|---|---|---|
| Hệ điều hành | Theo runner | Ubuntu, Windows, macOS nếu code tương thích | Chỉ Linux |
| Runtime/dependency | Có sẵn trên runner hoặc action con | Bundle vào `dist/` | Đóng gói trong image |
| Thời gian khởi động | Thấp | Thấp | Cao hơn do build hoặc pull image |
| Môi trường tái lập | Phụ thuộc runner | Tốt với bundle | Tốt nhất khi pin image/dependency |
| Dùng binary native | Có thể khó | Có thể khó | Phù hợp |

### Giới hạn nền tảng

Docker container action **chỉ chạy trên Linux**. Với GitHub-hosted runner, hãy dùng một Ubuntu runner phù hợp, chẳng hạn `ubuntu-latest` hoặc một phiên bản Ubuntu cụ thể.

Self-hosted runner phải đáp ứng cả hai điều kiện:

1. máy runner chạy Linux;
2. Docker Engine đã được cài và tài khoản runner có thể giao tiếp với Docker daemon.

Kiểm tra nhanh trên self-hosted runner:

```bash
uname -s
docker version
docker info
```

`uname -s` phải trả `Linux`. Hai lệnh Docker phải thành công dưới đúng tài khoản chạy dịch vụ runner, không chỉ dưới tài khoản quản trị đăng nhập tương tác.

<Callout type="warn" title="Windows và macOS runner không chạy container action">
  Cài Docker Desktop trên Windows hoặc macOS không làm Docker container action trở thành đa nền tảng. Runner của GitHub từ chối container action trên hai hệ điều hành này trước khi entrypoint được chạy.
</Callout>

## Cấu trúc một Docker container action

GitHub nhận diện custom action qua `action.yml` hoặc `action.yaml`; tên được khuyến nghị là `action.yml`. Với action build tại runtime, `Dockerfile` và mọi file được `COPY` phải nằm trong build context của action.

### Cây thư mục

Một repository action độc lập có thể dùng cấu trúc sau:

```text
repository-inventory-action/
├── .github/
│   └── workflows/
│       └── test-action.yml
├── .dockerignore
├── action.yml
├── Dockerfile
├── entrypoint.sh
└── README.md
```

Nếu action chỉ dùng trong một repository ứng dụng, có thể đặt toàn bộ action dưới `.github/actions/repository-inventory/`. Khi đó workflow gọi bằng `uses: ./.github/actions/repository-inventory` sau bước checkout.

### Vai trò của từng file

| File | Vai trò |
|---|---|
| `action.yml` | Công bố tên, input, output và cách chạy container. |
| `Dockerfile` | Chọn base image, cài dependency và đặt entrypoint. |
| `entrypoint.sh` | Đọc argument/env, thực hiện công việc, ghi output và trả exit code. |
| `.dockerignore` | Loại file không cần thiết khỏi build context, giảm thời gian build và nguy cơ đưa secret vào image. |
| `.github/workflows/test-action.yml` | Integration test metadata, build image, mount workspace và output thật trên runner. |
| `README.md` | Tài liệu interface, quyền, secret, nền tảng và ví dụ gọi action. |

`Dockerfile` không thay thế `action.yml`. Image biết cách khởi động chương trình, còn metadata biến chương trình đó thành một action có interface ổn định cho workflow.

## Metadata cho container

Khung tối thiểu của một Docker container action là:

```yaml
name: "Example container action"
description: "Chạy một chương trình trong container"

runs:
  using: docker
  image: Dockerfile
```

`runs.using` bắt buộc bằng `docker`. Các khóa quan trọng còn lại là `image`, `args`, `env` và tùy chọn `entrypoint`.

### runs.image

`runs.image` chọn image mà runner sẽ chạy. Có hai dạng chính:

```yaml
# Build Dockerfile nằm cạnh action.yml
runs:
  using: docker
  image: Dockerfile
```

```yaml
# Dùng image công khai đã phát hành
runs:
  using: docker
  image: "docker://ghcr.io/acme/repository-inventory:v1.2.3"
```

Khi tham chiếu Dockerfile local:

- file phải có tên `Dockerfile` đúng chữ hoa/thường;
- đường dẫn được tính tương đối từ thư mục chứa `action.yml`;
- các lệnh `COPY` đọc từ build context của Dockerfile;
- build xảy ra trên runner, nên kiến trúc image phải tương thích runner đó.

Khi dùng `docker://`, metadata reference của GitHub mô tả image từ **public registry**. Action metadata không có khóa khai báo registry credentials như `jobs.<job_id>.container.credentials`. Nếu cần image private, cách di động hơn là tự pull/run image trong một composite action hoặc reusable workflow có bước đăng nhập rõ ràng.

### runs.args

`runs.args` là mảng chuỗi được nối vào `ENTRYPOINT` khi container khởi động:

```yaml
inputs:
  source:
    description: "Thư mục nguồn tương đối từ workspace"
    required: false
    default: "."
  report:
    description: "File báo cáo tương đối từ workspace"
    required: false
    default: "inventory.md"

runs:
  using: docker
  image: Dockerfile
  args:
    - ${{ inputs.source }}
    - ${{ inputs.report }}
```

Entrypoint nhận hai giá trị lần lượt ở `$1` và `$2`. Runner giữ chúng thành hai argument riêng, nhưng script vẫn phải quote `"$1"` và `"$2"` khi sử dụng. Không ghép chúng vào `eval`, `sh -c "$*"` hoặc một chuỗi lệnh mới.

`args` trong metadata thay thế `CMD` của Dockerfile. Vì vậy, đừng đặt tham số bắt buộc chỉ trong `CMD` rồi kỳ vọng nó luôn còn hiệu lực. Đặt default ở `inputs`, validate trong entrypoint và mô tả trong README.

<Callout type="info" title="required không tự validate input">
  `inputs.<id>.required: true` mô tả hợp đồng nhưng không tự làm action thất bại khi giá trị trống. Entrypoint vẫn phải kiểm tra chuỗi rỗng, enum, path, độ dài và định dạng.
</Callout>

### runs.env

`runs.env` đặt biến môi trường cho container:

```yaml
runs:
  using: docker
  image: Dockerfile
  env:
    REPORT_TITLE: "Repository inventory"
    REPORT_MODE: ${{ inputs.mode }}
```

Dùng `env` cho cấu hình có tên rõ ràng hoặc giá trị không phù hợp với argument vị trí. Dùng `args` khi thứ tự tham số là một phần tự nhiên của CLI.

Không dùng `runs.env` để nhúng secret cố định vào action. Caller nên truyền secret lúc chạy, với quyền tối thiểu:

```yaml
- uses: OWNER/action@v1
  env:
    API_TOKEN: ${{ secrets.READ_ONLY_API_TOKEN }}
```

Action phải tránh in `env`, request header hoặc lỗi chứa token. Nếu action tạo ra credential mới, đăng ký mask bằng workflow command `::add-mask::` trước khi giá trị có thể xuất hiện trong log.

### ENTRYPOINT CMD và metadata override

Docker khuyến nghị dạng exec cho `ENTRYPOINT`:

```dockerfile
ENTRYPOINT ["/usr/local/bin/repository-inventory"]
```

Dạng này truyền signal và argument rõ ràng hơn shell form. `runs.args` được đưa vào script như argument, không trải qua shell substitution. Vì vậy, chuỗi `$GITHUB_SHA` trong một argument sẽ vẫn là chuỗi literal nếu entrypoint không tự mở shell.

Nếu metadata khai báo `runs.entrypoint`, giá trị đó override `ENTRYPOINT` của Dockerfile:

```yaml
runs:
  using: docker
  image: Dockerfile
  entrypoint: /usr/local/bin/alternate-entrypoint
```

Chỉ override khi cùng image thật sự cung cấp nhiều điểm vào. Một nguồn cấu hình duy nhất trong Dockerfile thường dễ test local và ít gây bất ngờ hơn.

Không dùng đường dẫn entrypoint tương đối theo `WORKDIR`. GitHub đặt working directory runtime thành workspace được mount. Dùng đường dẫn tuyệt đối như `/usr/local/bin/repository-inventory`.

### Pre và post entrypoint

Metadata còn hỗ trợ `pre-entrypoint` và `post-entrypoint`:

```yaml
runs:
  using: docker
  image: Dockerfile
  pre-entrypoint: /usr/local/bin/prepare
  entrypoint: /usr/local/bin/main
  post-entrypoint: /usr/local/bin/cleanup
```

Mỗi giai đoạn chạy trong **một container mới** từ cùng base image. Bộ nhớ, process và filesystem layer riêng của container trước không được giữ lại. Dữ liệu cần truyền phải nằm trong workspace, `HOME` được mount hoặc state do runner quản lý.

Chỉ thêm lifecycle này khi action thật sự có tài nguyên cần chuẩn bị/dọn dẹp. Ba container làm tăng thời gian khởi động và khiến xử lý lỗi phức tạp hơn.

## Inputs outputs và workflow commands

Container action không cần Actions Toolkit để giao tiếp với runner. Nó dùng argument, biến môi trường, exit code và các file command mà runner mount vào container.

### Nhận input

Cách rõ ràng nhất là khai báo input rồi ánh xạ qua `runs.args`:

```yaml
inputs:
  threshold:
    description: "Ngưỡng lỗi"
    required: true

runs:
  using: docker
  image: Dockerfile
  args:
    - ${{ inputs.threshold }}
```

Entrypoint parse và validate:

```sh
threshold=${1:-}

case "$threshold" in
  ''|*[!0-9]*)
    printf '::error::threshold phải là số nguyên không âm\n' >&2
    exit 1
    ;;
esac
```

Metadata reference lưu ý rằng Docker container action cần truyền input vào container qua `args`. Đừng dựa vào việc một biến `INPUT_*` bất kỳ sẽ tự xuất hiện trong image; ánh xạ tường minh giúp interface dễ đọc và test local.

### Tạo output bằng GITHUB_OUTPUT

Khai báo output trong metadata:

```yaml
outputs:
  file-count:
    description: "Số file đã tìm thấy"
```

Sau đó append `name=value` vào file có đường dẫn trong `$GITHUB_OUTPUT`:

```sh
printf 'file-count=%s\n' "$file_count" >> "$GITHUB_OUTPUT"
```

Caller phải đặt `id` cho step trước khi đọc output:

```yaml
- name: Chạy action
  id: inventory
  uses: OWNER/repository-inventory-action@v1

- name: Dùng output
  env:
    FILE_COUNT: ${{ steps.inventory.outputs.file-count }}
  run: printf 'Files: %s\n' "$FILE_COUNT"
```

Output nhiều dòng dùng cú pháp delimiter của environment file. Delimiter phải duy nhất; nếu dữ liệu hoàn toàn tùy ý, ghi vào file trong workspace rồi upload artifact thay vì đưa qua output.

GitHub giới hạn output tối đa khoảng 1 MB cho mỗi job và tổng 50 MB cho một workflow run, ước tính theo UTF-16. Output phù hợp với metadata nhỏ như số đếm, URL hoặc path. Báo cáo lớn nên là file/artifact.

### Log annotation và exit code

Các workflow command phổ biến dùng trực tiếp từ shell:

```sh
printf '::debug::Đang quét workspace\n'
printf '::notice title=Inventory::Đã tạo báo cáo\n'
printf '::warning file=src/app.sh,line=12::Mẫu cần xem lại\n'
printf '::error::Input không hợp lệ\n' >&2
```

Annotation `::error::` chỉ ghi lỗi lên giao diện; nó không tự đặt trạng thái thất bại. GitHub dùng exit code của entrypoint:

- `0`: action thành công;
- khác `0`: action thất bại.

Dùng `set -eu` hoặc xử lý lỗi tương đương, rồi trả mã khác `0` khi kết quả không còn đáng tin cậy.

## Workspace và filesystem

Container có filesystem riêng, nhưng runner bind-mount một số thư mục để action trao đổi dữ liệu với job.

### Các thư mục được mount

Trên GitHub-hosted Linux runner, container action có các path tĩnh dưới `/github`:

| Biến | Path thường thấy trong container | Mục đích |
|---|---|---|
| `HOME` | `/github/home` | Dữ liệu home tạm cho action. |
| `GITHUB_WORKSPACE` | `/github/workspace` | Repository của caller sau checkout và file chia sẻ giữa các step. |
| `GITHUB_EVENT_PATH` | Dưới `/github/workflow` | Payload sự kiện hiện tại. |
| `GITHUB_OUTPUT` | Dưới `/github/file_commands` | File ghi output của step. |
| `GITHUB_ENV` | Dưới `/github/file_commands` | File đặt env cho step sau trong job. |
| `GITHUB_PATH` | Dưới `/github/file_commands` | File bổ sung PATH cho step sau. |
| `GITHUB_STEP_SUMMARY` | Dưới `/github/file_commands` | File Markdown cho job summary. |

Path cụ thể có thể thay đổi. Mã action phải đọc biến môi trường thay vì hardcode `/github/file_commands/...`.

GitHub đặt `GITHUB_WORKSPACE` làm working directory trước khi entrypoint chạy. Không dùng `WORKDIR` trong Dockerfile để dựa vào một thư mục runtime khác; workspace mount có thể che nội dung từng tồn tại tại vị trí đó.

### Dữ liệu nào tồn tại sau action

- File viết dưới `$GITHUB_WORKSPACE` tồn tại cho các step sau trong cùng job.
- Dữ liệu ghi đúng các file command được runner đọc sau khi step kết thúc.
- File chỉ nằm trong writable layer của container biến mất khi container bị xóa.
- Image layer không thay đổi khi container chạy.
- Process nền trong container không phải cơ chế dịch vụ bền vững; container kết thúc cùng entrypoint.

Ví dụ, action tạo `inventory.md` trong workspace thì step sau có thể upload file đó:

```yaml
- name: Upload inventory
  uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
  with:
    name: repository-inventory
    path: inventory.md
```

Nếu workflow chưa checkout, `$GITHUB_WORKSPACE` có thể không chứa source mà action dự kiến. Local action dùng `uses: ./...` cũng yêu cầu checkout để metadata và Dockerfile tồn tại trong workspace.

### UID và permissions

Tài liệu Dockerfile support của GitHub yêu cầu Docker action chạy bằng user mặc định của Docker, tức `root`, và khuyến cáo **không dùng `USER`** vì user khác có thể không truy cập được `GITHUB_WORKSPACE`.

```dockerfile
# Không dùng cho Docker container action cần workspace
USER app
```

Chạy root trong container không có nghĩa là action an toàn hay hoàn toàn tách khỏi host. Nó còn tạo ra một vấn đề thực tế: file mới trong bind mount có thể thuộc UID `0`, khiến step sau hoặc quá trình cleanup trên self-hosted runner gặp `Permission denied`.

Cách giảm vấn đề ownership:

1. Chỉ ghi đúng các file action chịu trách nhiệm.
2. Đọc UID/GID của thư mục workspace bằng `stat`.
3. `chown` file kết quả về owner đó trước khi container thoát.
4. Không chạy `chown -R` trên toàn workspace; thao tác này chậm và có thể phá permission caller đã thiết lập.
5. Kiểm thử trên self-hosted runner thực tế vì bind mount, user namespace và Docker Desktop có hành vi khác nhau.

Ví dụ:

```sh
workspace_owner=$(stat -c '%u:%g' "$GITHUB_WORKSPACE")
chown "$workspace_owner" "$report_path"
chmod 0644 "$report_path"
```

<Callout type="warn" title="Không coi USER non-root là lớp hardening được hỗ trợ">
  Với Docker container action, hỗ trợ truy cập workspace quan trọng hơn mẫu Docker production thông thường. Hãy giữ user mặc định theo tài liệu GitHub, giới hạn quyền token/network ở cấp runner và workflow, rồi sửa ownership cho đúng các artifact đã tạo.
</Callout>

## Network của container action

Container action có network namespace riêng. Nó có thể tạo kết nối ra ngoài nếu Docker network, DNS, proxy và firewall của runner cho phép.

### Kết nối ra ngoài

Có hai giai đoạn mạng độc lập:

1. **Build hoặc pull:** runner cần truy cập registry của base image hoặc image `docker://`.
2. **Runtime:** entrypoint cần truy cập API, package registry hoặc dịch vụ mà logic action sử dụng.

Self-hosted runner sau proxy phải cấu hình cả Docker daemon và môi trường container. Chỉ đặt `HTTP_PROXY` cho service runner chưa chắc làm `docker pull` dùng cùng proxy. Với allowlist, thêm đúng registry và endpoint runtime; không mở toàn bộ Internet chỉ để xử lý một lỗi pull.

Action metadata không cung cấp `runs.ports`, `runs.volumes`, `runs.options` hoặc cờ thêm/bớt Linux capabilities. GitHub hỗ trợ tập capability mặc định của Docker và không cho action yêu cầu `--privileged` qua metadata.

### Service container và localhost

`localhost` bên trong Docker action là **chính container action**, không phải runner host và cũng không phải service container khác. Đừng hardcode `http://localhost:<port>` nếu server được khởi động ở một container sibling.

Khi job chạy trong `jobs.<job_id>.container`, Docker container action chạy như sibling container trên cùng network và cùng volume mount. Service container có thể được truy cập bằng label, chẳng hạn `postgres:5432`:

```yaml
jobs:
  analyze:
    runs-on: ubuntu-latest
    container: alpine:3.23
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: test-password
    steps:
      - uses: OWNER/container-action@v1
        env:
          DATABASE_HOST: postgres
          DATABASE_PORT: "5432"
```

Nếu job chạy trực tiếp trên runner, `run` step trên host thường dùng port service đã map qua `localhost`. Container action lại có network namespace khác. Nếu action cần kết nối service, ưu tiên cấu hình job container và dùng service label, hoặc truyền một endpoint thật sự reachable rồi test trên đúng loại runner.

Không ghi credential vào URL log. Truyền hostname, port, username và secret qua các biến riêng; chỉ log endpoint không nhạy cảm.

## Ví dụ end-to-end

Ví dụ xây dựng action **Repository Inventory**. Action đếm file trong một thư mục workspace, bỏ qua `.git`, tạo báo cáo Markdown và công bố hai output.

### Mục tiêu và hợp đồng

| Thành phần | ID | Hành vi |
|---|---|---|
| Input | `source` | Thư mục cần đếm, tương đối từ workspace; mặc định `.`. |
| Input | `report` | File báo cáo tương đối từ workspace; mặc định `inventory.md`. Thư mục cha phải tồn tại. |
| Output | `file-count` | Số regular file tìm thấy trước khi tạo báo cáo. |
| Output | `report-path` | Path báo cáo tương đối để step sau sử dụng. |
| Env nội bộ | `REPORT_TITLE` | Tiêu đề báo cáo do metadata đặt. |

Action từ chối path tuyệt đối, thành phần `..`, source nằm ngoài workspace, thư mục output qua symlink và output file là symbolic link. Những kiểm tra này biến input thành dữ liệu thay vì để nó điều khiển filesystem tùy ý.

### action.yml hoàn chỉnh

Tạo `action.yml` ở root repository action:

```yaml
name: "Repository Inventory"
description: "Đếm file trong workspace và tạo báo cáo Markdown"
author: "Platform Team"

inputs:
  source:
    description: "Thư mục nguồn tương đối từ GITHUB_WORKSPACE"
    required: false
    default: "."
  report:
    description: "File báo cáo tương đối; thư mục cha phải tồn tại"
    required: false
    default: "inventory.md"

outputs:
  file-count:
    description: "Số regular file đã tìm thấy"
  report-path:
    description: "Đường dẫn tương đối của báo cáo"

runs:
  using: docker
  image: Dockerfile
  env:
    REPORT_TITLE: "Repository inventory"
  args:
    - ${{ inputs.source }}
    - ${{ inputs.report }}

branding:
  icon: "file-text"
  color: "blue"
```

`source` và `report` đi vào entrypoint ở `$1` và `$2`. `REPORT_TITLE` minh họa cấu hình qua `runs.env`. Output chỉ được khai báo tại đây; giá trị thật do script ghi vào `$GITHUB_OUTPUT`.

### Dockerfile hoàn chỉnh

Tạo `Dockerfile`:

```dockerfile
FROM alpine:3.23.5@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40

COPY entrypoint.sh /usr/local/bin/repository-inventory
RUN chmod 0755 /usr/local/bin/repository-inventory

ENTRYPOINT ["/usr/local/bin/repository-inventory"]
```

Digest trên là manifest đa kiến trúc của tag `alpine:3.23.5` tại thời điểm biên soạn. Tag giữ ý nghĩa cho người review; digest giữ nội dung image bất biến. Khi nâng Alpine, cập nhật cả tag, digest, release notes và chạy lại integration test.

Image không cần `apk add`, nên không phát sinh dependency hệ thống ngoài Alpine/BusyBox. Không có `WORKDIR`, `USER` hoặc `CMD` để xung đột với cách runner mount workspace và truyền argument.

Tạo `.dockerignore` để build context nhỏ và không vô tình copy dữ liệu cục bộ:

```text
.git
.github
.env
.env.*
*.key
*.pem
README.md
```

Dockerfile chỉ `COPY entrypoint.sh`, nhưng `.dockerignore` vẫn giảm lượng dữ liệu gửi vào Docker daemon. Không bao giờ để `.env`, credential hoặc private key trong build context.

### entrypoint.sh hoàn chỉnh

Tạo `entrypoint.sh`:

```sh
#!/bin/sh
set -efu

error() {
  printf '::error::%s\n' "$*" >&2
  exit 1
}

is_safe_relative_path() {
  candidate=$1

  case "$candidate" in
    ''|/*) return 1 ;;
  esac

  old_ifs=$IFS
  IFS='/'
  set -- $candidate
  IFS=$old_ifs

  for component do
    if [ "$component" = '..' ]; then
      return 1
    fi
  done

  return 0
}

source_rel=${1:-.}
report_rel=${2:-inventory.md}

[ -n "${GITHUB_WORKSPACE:-}" ] || error 'Thiếu GITHUB_WORKSPACE.'
[ -n "${GITHUB_OUTPUT:-}" ] || error 'Thiếu GITHUB_OUTPUT.'

is_safe_relative_path "$source_rel" || \
  error "Input 'source' phải là path tương đối không chứa '..'."
is_safe_relative_path "$report_rel" || \
  error "Input 'report' phải là path tương đối không chứa '..'."

case "$report_rel" in
  */) error "Input 'report' phải là tên file, không phải thư mục." ;;
esac

workspace=$(realpath "$GITHUB_WORKSPACE") || error 'Không resolve được workspace.'
source_path=$(realpath "$workspace/$source_rel") || \
  error "Không tìm thấy source: $source_rel"

case "$source_path" in
  "$workspace"|"$workspace"/*) ;;
  *) error "Source nằm ngoài workspace: $source_rel" ;;
esac

[ -d "$source_path" ] || error "Source không phải thư mục: $source_rel"

report_parent="$workspace/$(dirname "$report_rel")"
[ -d "$report_parent" ] || \
  error "Thư mục cha của report chưa tồn tại: $(dirname "$report_rel")"

report_dir=$(realpath "$report_parent") || error 'Không resolve được thư mục report.'
case "$report_dir" in
  "$workspace"|"$workspace"/*) ;;
  *) error "Thư mục report nằm ngoài workspace: $report_rel" ;;
esac

report_path="$report_dir/$(basename "$report_rel")"
[ ! -L "$report_path" ] || error "Từ chối ghi đè symbolic link: $report_rel"

file_count=$(
  find "$source_path" \
    \( -type d -name .git -prune \) -o \
    -type f -exec printf . \; |
    wc -c |
    tr -d '[:space:]'
)

report_tmp=$(mktemp "$report_dir/.repository-inventory.XXXXXX") || \
  error 'Không tạo được file report tạm.'
trap 'rm -f "$report_tmp"' 0 1 2 15

{
  printf '# %s\n\n' "${REPORT_TITLE:-Repository inventory}"
  printf '| Thuộc tính | Giá trị |\n'
  printf '|---|---:|\n'
  printf '| Số file | %s |\n' "$file_count"
  printf '| Commit | `%s` |\n' "${GITHUB_SHA:-local-test}"
} > "$report_tmp"

workspace_owner=$(stat -c '%u:%g' "$workspace") || \
  error 'Không đọc được UID/GID của workspace.'
chown "$workspace_owner" "$report_tmp" || \
  error 'Không thể trả ownership của report cho owner workspace.'
chmod 0644 "$report_tmp"
mv -f "$report_tmp" "$report_path"
trap - 0 1 2 15

printf 'file-count=%s\n' "$file_count" >> "$GITHUB_OUTPUT"
printf 'report-path=%s\n' "$report_rel" >> "$GITHUB_OUTPUT"
printf 'Đã tạo %s với %s file.\n' "$report_rel" "$file_count"
```

`set -f` tắt pathname expansion trong lúc hàm tách path theo `/`. Script không dùng `eval`, luôn quote biến và resolve path thật trước khi đọc/ghi. Báo cáo được ghi vào file tạm rồi `mv`, tránh để lại file dở dang nếu lệnh trước đó thất bại.

Đặt executable bit trong Git index để entrypoint vẫn chạy sau clone:

```bash
chmod +x entrypoint.sh
git add entrypoint.sh
git update-index --chmod=+x entrypoint.sh
git ls-files --stage entrypoint.sh
```

Mode phải bắt đầu bằng `100755`.

### Workflow gọi local action

Tạo `.github/workflows/test-action.yml` trong repository action:

```yaml
name: Test Docker container action

on:
  push:
    paths:
      - "action.yml"
      - "Dockerfile"
      - "entrypoint.sh"
      - ".dockerignore"
      - ".github/workflows/test-action.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  integration-test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout action source
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Chạy local container action
        id: inventory
        uses: ./
        with:
          source: "."
          report: "inventory.md"

      - name: Kiểm chứng output và artifact
        shell: bash
        env:
          FILE_COUNT: ${{ steps.inventory.outputs.file-count }}
          REPORT_PATH: ${{ steps.inventory.outputs.report-path }}
        run: |
          test "$FILE_COUNT" -ge 4
          test "$REPORT_PATH" = "inventory.md"
          test -s "$REPORT_PATH"
          grep -F "# Repository inventory" "$REPORT_PATH"
          grep -F "| Số file | $FILE_COUNT |" "$REPORT_PATH"
          test "$(stat -c '%u' "$REPORT_PATH")" -eq "$(id -u)"
          printf 'Đã kiểm chứng %s file trong %s\n' \
            "$FILE_COUNT" "$REPORT_PATH"
```

`uses: ./` yêu cầu checkout trước. Runner đọc metadata từ root, build Dockerfile, mount cùng workspace vào container và chạy assertion sau khi container thoát.

Workflow chỉ cấp `contents: read`. Action không cần token ghi, secret hay kết nối mạng lúc runtime.

### Gọi action đã phát hành

Sau khi repository action có release `v1`, consumer dùng:

```yaml
name: Repository inventory

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  inventory:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Tạo inventory
        id: inventory
        uses: YOUR_ORG/repository-inventory-action@v1
        with:
          source: "src"
          report: "inventory.md"

      - name: Hiển thị kết quả
        env:
          FILE_COUNT: ${{ steps.inventory.outputs.file-count }}
          REPORT_PATH: ${{ steps.inventory.outputs.report-path }}
        run: |
          printf 'Files: %s\n' "$FILE_COUNT"
          cat "$REPORT_PATH"

      - name: Upload report
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: repository-inventory
          path: ${{ steps.inventory.outputs.report-path }}
          if-no-files-found: error
```

Thay `YOUR_ORG` bằng owner thật. Trong môi trường yêu cầu tính bất biến, thay `@v1` bằng full commit SHA của release đã xác minh.

## Build và kiểm thử local

Local test rút ngắn vòng phản hồi cho lỗi Dockerfile, executable bit, entrypoint, path và output format. Nó không thay thế integration test trên GitHub vì máy local không tái tạo toàn bộ runner protocol, network và permission.

### Build image

Từ root repository action:

```bash
docker build --pull --tag repository-inventory-action:local .
docker image inspect repository-inventory-action:local \
  --format '{{json .Config.Entrypoint}}'
```

Kết quả inspect phải chứa:

```text
["/usr/local/bin/repository-inventory"]
```

`--pull` kiểm tra base image vẫn truy cập được. Vì Dockerfile pin digest, nội dung image không đổi ngay cả khi tag được di chuyển; Docker cũng phát hiện nếu tag và digest không còn trỏ cùng manifest.

### Mô phỏng môi trường runner

Lệnh sau tạo fixture và mount các path tối thiểu cần cho ví dụ:

```bash
set -eu

image='repository-inventory-action:local'
fixture=$(mktemp -d)
commands=$(mktemp -d)
trap 'rm -rf "$fixture" "$commands"' EXIT

mkdir -p "$fixture/src"
printf 'alpha\n' > "$fixture/src/a.txt"
printf 'beta\n' > "$fixture/src/b.txt"
touch "$commands/output"

docker run --rm \
  --volume "$fixture:/github/workspace" \
  --volume "$commands:/github/file_commands" \
  --env GITHUB_WORKSPACE=/github/workspace \
  --env GITHUB_OUTPUT=/github/file_commands/output \
  --env GITHUB_SHA=local-test \
  --env REPORT_TITLE='Repository inventory' \
  "$image" "src" "inventory.md"

grep -Fx 'file-count=2' "$commands/output"
grep -Fx 'report-path=inventory.md' "$commands/output"
grep -F '| Số file | 2 |' "$fixture/inventory.md"
cat "$fixture/inventory.md"
```

Đây là mô phỏng có chủ đích, không phải bản sao đầy đủ của câu lệnh `docker run` do runner tạo. GitHub còn mount home, event payload, temp, các file command khác và biến context.

Kiểm tra ca lỗi path traversal:

```bash
if docker run --rm \
  --volume "$fixture:/github/workspace" \
  --volume "$commands:/github/file_commands" \
  --env GITHUB_WORKSPACE=/github/workspace \
  --env GITHUB_OUTPUT=/github/file_commands/output \
  "$image" "../" "inventory.md"; then
  echo 'Action phải từ chối path traversal.' >&2
  exit 1
fi
```

### Tiêu chí kiểm chứng

| Kiểm tra | Kết quả mong đợi |
|---|---|
| Build | Docker build thành công từ clone sạch. |
| Entrypoint | Image có exec-form entrypoint tuyệt đối và script executable. |
| Input hợp lệ | Fixture có hai file tạo báo cáo với số `2`. |
| Output | File command chứa đúng `file-count=2` và `report-path=inventory.md`. |
| Workspace | `inventory.md` xuất hiện trên host sau khi container thoát. |
| Permission | Trên Ubuntu runner, owner của báo cáo trùng user runner. |
| Validation | `../`, path tuyệt đối, source không tồn tại và symlink output đều làm action thất bại. |
| GitHub integration | `uses: ./` build/chạy được và step assertion pass. |
| Secret | Log không chứa token, toàn bộ env hoặc event payload. |

## Build từ Dockerfile hay dùng docker URI

Hai chiến lược cùng tạo container action nhưng có biên phát hành, hiệu năng và rủi ro chuỗi cung ứng khác nhau.

### Image build từ repository action

```yaml
runs:
  using: docker
  image: Dockerfile
```

Ưu điểm:

- source, Dockerfile và metadata cùng một Git ref;
- consumer không cần tin thêm một tag image do maintainer quản lý riêng;
- không cần pipeline publish image;
- review commit action cho biết chính xác logic build.

Đổi lại, mỗi runner mới phải tải base image và build. GitHub-hosted runner thường là máy mới, nên không nên giả định layer cache tồn tại giữa hai workflow run.

Chiến lược này phù hợp với image nhỏ, ít layer và build nhanh. Ví dụ chỉ `COPY` một script vào Alpine thường có chi phí chấp nhận được.

### Image có sẵn từ registry

Trong metadata:

```yaml
runs:
  using: docker
  image: "docker://ghcr.io/acme/repository-inventory:v1.2.3"
```

Hoặc gọi trực tiếp từ workflow mà không có repository action:

```yaml
- name: In phiên bản Alpine
  uses: docker://alpine:3.23
  with:
    args: cat /etc/alpine-release
```

Gọi trực tiếp `docker://` thuận tiện cho một CLI đơn giản, nhưng không có `action.yml` riêng để công bố input/output có mô tả. Bọc image trong repository action phù hợp hơn khi cần interface ổn định, README, branding và release notes.

Ưu điểm của image registry:

- bỏ bước Docker build trên runner;
- build một lần, quét một lần và phát hành image đa kiến trúc;
- phù hợp với image lớn hoặc compile tốn thời gian.

Đổi lại:

- registry phải sẵn sàng và image phải public theo interface container action được tài liệu hóa;
- tag có thể di chuyển;
- consumer phải tin cả Git ref của action lẫn image mà metadata tham chiếu;
- registry rate limit, outage hoặc kiến trúc thiếu manifest có thể làm step thất bại;
- Dependabot hiện không cập nhật tham chiếu action dạng `docker://` cho Docker Hub hoặc GHCR.

Để bất biến, dùng digest nếu registry hỗ trợ:

```yaml
runs:
  using: docker
  image: "docker://ghcr.io/acme/repository-inventory@sha256:0123456789abcdef..."
```

Không sao chép digest minh họa. Lấy digest thật từ pipeline phát hành và kiểm tra nó thuộc image chính chủ.

### Hiệu năng và cache

Tối ưu theo thứ tự sau:

1. Chọn base image đủ nhỏ nhưng còn được cập nhật bảo mật.
2. Dùng `.dockerignore` để giảm build context.
3. Đặt layer ít thay đổi trước layer thay đổi thường xuyên.
4. Gộp cài đặt package và xóa package-manager cache trong cùng layer.
5. Dùng multi-stage build để bỏ compiler khỏi runtime image.
6. Không tải dependency runtime nếu có thể đóng gói trong image.
7. Đo thời gian `docker pull`, `docker build` và entrypoint riêng; không tối ưu theo cảm giác.

Trên GitHub-hosted runner, cache layer không bền vững giữa job. Trên self-hosted runner, Docker cache có thể tồn tại nhưng phải có chính sách prune để tránh đầy disk và không được xem cache cũ là nguồn correctness.

GitHub Actions cache không tự động cache layer build của Docker container action. Bạn cũng không thể chèn `docker/build-push-action` trước giai đoạn runner build `image: Dockerfile` của chính step đó. Nếu build quá nặng, publish image trước và chuyển sang `docker://`.

## Bảo mật và chuỗi cung ứng

Container đóng gói dependency, nhưng cũng đóng gói mọi lỗ hổng và hành vi độc hại của chúng. Image không phải bằng chứng về nguồn gốc hoặc độ an toàn.

### Base image và dependencies

Áp dụng các lớp kiểm soát sau:

- Dùng image official hoặc image do tổ chức sở hữu và review.
- Tránh `latest`; pin version cụ thể và digest.
- Với package manager, pin version và commit lockfile nếu hệ sinh thái hỗ trợ.
- Không chạy `curl ... | sh` trong Dockerfile.
- Dùng multi-stage build để giảm binary, package manager và compiler trong runtime.
- Tạo `.dockerignore` từ allowlist thực tế; loại `.git`, fixture lớn, `.env`, key và credential.
- Không dùng build argument cho secret. Build log và layer có thể lưu lại giá trị.
- Quét image trong CI, tạo SBOM và xử lý CVE theo mức độ khai thác thực tế.
- Rebuild định kỳ để nhận base image đã vá, ngay cả khi source action không đổi.
- Review thay đổi digest như thay đổi dependency, không chấp nhận bot update mà không test.

Pin digest tăng tính tái lập nhưng cũng ngăn tự nhận bản vá. Cách đúng là automation mở pull request cập nhật digest, quét và integration test trước khi release mới.

### Input secret và quyền của runner

Mọi giá trị từ input, branch, issue, pull request, event payload và file trong workspace đều có thể không đáng tin cậy.

- Truyền expression qua `args` hoặc `env`, không chèn vào một shell script được sinh động.
- Quote mọi biến shell.
- Dùng allowlist cho enum, URL scheme, hostname, extension và command option.
- Với path, từ chối path tuyệt đối, `..` và symlink thoát workspace.
- Không nhận input `command`, `script` hoặc `extra-args` tự do rồi `eval`.
- Không dump `env` hoặc toàn bộ event JSON vào log.
- Caller đặt `permissions` tối thiểu và chỉ truyền secret action thật sự cần.
- Tránh chạy code pull request không tin cậy bằng `pull_request_target` trong job có secret hoặc quyền ghi.
- Đặt `timeout-minutes` ở job vì action không tự đặt timeout cho caller.

Container action chạy bằng root trong container theo contract Dockerfile support. Trên self-hosted runner, không chạy workflow không tin cậy trên máy giữ key, credential cloud hoặc kết nối mạng nội bộ nhạy cảm. Ưu tiên runner tạm thời, runner group theo ranh giới tin cậy và môi trường sạch cho mỗi job.

### Docker socket và ranh giới tin cậy

Container không phải ranh giới bảo mật giữa action và runner. Triển khai runner tiêu chuẩn mount workspace và các file runner vào action container; mã action có thể sửa dữ liệu mà step sau tin tưởng. GitHub cũng cảnh báo một action bị xâm phạm có thể tương tác với Docker socket và container khác trong job.

Do đó:

- không chạy action không tin cậy chỉ vì nó “ở trong Docker”;
- review source, Dockerfile, entrypoint và mọi image/dependency;
- pin GitHub action bằng full commit SHA ở consumer nhạy cảm;
- không truyền Docker socket cho logic ứng dụng như một API tiện lợi;
- không để secret trong environment lâu hơn cần thiết;
- tách build không tin cậy khỏi publish/deploy đặc quyền;
- dùng GitHub-hosted runner hoặc self-hosted runner ephemeral khi có thể.

Nếu action thật sự cần Docker-in-Docker hoặc build image, hãy thiết kế riêng và đánh giá quyền Docker daemon. Quyền điều khiển daemon thường tương đương quyền cao trên host; đây không còn là một action “bị giới hạn trong container”.

## Release và versioning

Interface của action gồm input, output, hành vi filesystem, image, nền tảng hỗ trợ và exit code. Thay đổi một trong các phần đó có thể làm workflow consumer hỏng.

### Version repository action

Quy trình đề xuất:

1. Chạy local test và integration workflow trên Ubuntu.
2. Quét base image/dependency và review digest.
3. Xác nhận README mô tả input, output, quyền, network và Linux-only.
4. Tạo tag SemVer cụ thể, ví dụ `v1.2.3`.
5. Tạo GitHub Release với thay đổi, migration note và digest base image.
6. Nếu chính sách cho phép tag di động, cập nhật `v1` đến cùng commit đã release.
7. Bảo vệ tag/release và yêu cầu review cho `action.yml`, Dockerfile, script và workflow phát hành.

Quy ước SemVer:

- patch: sửa lỗi không đổi interface;
- minor: thêm input tùy chọn hoặc output mới tương thích;
- major: đổi tên/xóa input-output, thay default gây đổi hành vi, bỏ runner/kiến trúc hoặc thay side effect filesystem.

Consumer thuận tiện có thể dùng:

```yaml
uses: OWNER/repository-inventory-action@v1
```

Consumer ưu tiên bất biến dùng full SHA:

```yaml
uses: OWNER/repository-inventory-action@0123456789abcdef0123456789abcdef01234567 # v1.2.3
```

Không khuyến nghị `@main` cho production. Nhánh mặc định thay đổi mà không có release boundary.

### Version image registry

Nếu metadata dùng `docker://`, version repository và version image phải được liên kết rõ ràng. Ví dụ release action `v1.2.3` tham chiếu image digest được build từ chính commit release đó.

Pipeline publish image nên:

- build từ commit đã qua required checks;
- tạo manifest cho mọi kiến trúc runner tuyên bố hỗ trợ;
- gắn tag bất biến `v1.2.3` và ghi digest vào release notes;
- quét lỗ hổng, tạo SBOM và provenance/attestation nếu quy trình hỗ trợ;
- ký image khi tổ chức có chính sách xác minh chữ ký;
- không di chuyển tag patch đã phát hành;
- chỉ di chuyển tag major/minor theo policy đã công bố;
- giữ image cũ trong thời gian deprecation để consumer pin digest không bị mất.

Tag image và tag Git không tự động đồng bộ. Hãy có một job release duy nhất tạo cả hai hoặc xác minh mapping trước khi publish GitHub Release.

## Bài thực hành

Bài thực hành dùng toàn bộ ví dụ Repository Inventory. Chuẩn bị Git, Docker và một repository GitHub đã bật Actions.

### Các bước thực hiện

<Steps>
<Step>

**Tạo repository action**

Tạo repository mới và các file `action.yml`, `Dockerfile`, `entrypoint.sh`, `.dockerignore`, `.github/workflows/test-action.yml` theo ví dụ. Đặt executable bit cho entrypoint.

</Step>
<Step>

**Build và test local**

Chạy `docker build --pull`, lệnh mô phỏng runner và ca path traversal. Sửa mọi lỗi trước khi push.

</Step>
<Step>

**Kiểm thử trên GitHub**

Commit và push branch. Workflow phải build image, tạo `inventory.md`, đọc được hai output và xác nhận owner của file là user runner.

</Step>
<Step>

**Kiểm tra ca lỗi**

Chạy lần lượt với `source: missing`, `source: ../` và `report: /tmp/report.md`. Mỗi trường hợp phải fail với annotation rõ ràng và không tạo file ngoài workspace.

</Step>
<Step>

**Phát hành**

Tạo `v1.0.0`, ghi release notes và trỏ `v1` đến cùng commit nếu policy cho phép. Gọi action từ một repository khác bằng Ubuntu runner.

</Step>
</Steps>

### Checklist hoàn thành

- [ ] `action.yml` không có lỗi thụt lề và dùng `runs.using: docker`.
- [ ] `runs.args` khớp thứ tự `$1`, `$2` trong entrypoint.
- [ ] Dockerfile pin base image bằng version và digest đã xác minh.
- [ ] `entrypoint.sh` có mode `100755`, LF line endings và shebang hợp lệ.
- [ ] Local build/test chạy từ clone sạch.
- [ ] Input hợp lệ tạo báo cáo trong workspace và hai output đúng.
- [ ] Input path nguy hiểm bị từ chối trước khi đọc/ghi.
- [ ] File báo cáo không gây lỗi permission cho step sau.
- [ ] Workflow chỉ cấp `contents: read` và không truyền secret không cần thiết.
- [ ] Integration test chạy trên Ubuntu và có `timeout-minutes`.
- [ ] Release SemVer đến từ commit đã qua required checks.
- [ ] Consumer dùng release tag hoặc full commit SHA, không dùng `main`.

## Best practices

- **Chọn container vì dependency, không vì thói quen.** Với vài lệnh shell, composite action thường nhanh và đơn giản hơn.
- **Công bố Linux-only.** README và ví dụ phải dùng Ubuntu; đừng để consumer tự phát hiện qua lỗi runtime.
- **Giữ image nhỏ.** Giảm build context, layer, package và binary không cần thiết.
- **Pin mọi dependency.** Base image dùng version cộng digest; package dùng lockfile hoặc version xác định.
- **Dùng exec-form ENTRYPOINT.** Đường dẫn tuyệt đối, script executable và không phụ thuộc `WORKDIR`.
- **Không dựa vào CMD cho input bắt buộc.** `runs.args` override CMD; default thuộc metadata và validation thuộc entrypoint.
- **Xem input là dữ liệu.** Truyền qua argument/env, quote biến, validate và không `eval`.
- **Dùng environment files hiện hành.** Ghi output vào `$GITHUB_OUTPUT`, không dùng cú pháp `::set-output` cũ.
- **Ghi file chia sẻ vào workspace.** Writable layer của container biến mất sau step.
- **Sửa ownership có mục tiêu.** Chỉ `chown` artifact action tạo, không `chown -R` workspace.
- **Không đặt USER tùy ý.** Tuân theo Dockerfile support của GitHub nếu action cần workspace.
- **Không hardcode localhost.** Hiểu network namespace và dùng service label khi job chạy trong container.
- **Không xem container là sandbox.** Review action như code có quyền thực thi trong job.
- **Cấp quyền tối thiểu.** Token, secret, egress và runner group do caller/platform kiểm soát.
- **Đo cold start.** Test trên runner mới; cache self-hosted không đại diện GitHub-hosted runner.
- **Test cả local và GitHub.** Local test bắt lỗi image; integration test bắt lỗi runner mount, output và permission.
- **Phát hành có biên giới.** SemVer, release notes, protected tag và full SHA giúp consumer kiểm soát nâng cấp.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Container action is only supported on Linux` | Job dùng Windows hoặc macOS runner. | Chuyển job sang Ubuntu/Linux hoặc viết JavaScript/composite action đa nền tảng. |
| `docker: command not found` trên self-hosted runner | Docker chưa cài hoặc không nằm trong PATH của service runner. | Cài Docker Engine, restart runner service và kiểm tra `docker version` dưới đúng tài khoản runner. |
| `permission denied while trying to connect to the Docker daemon socket` | Tài khoản runner không có quyền với Docker daemon. | Cấu hình group/socket theo chính sách hệ thống, đăng nhập lại hoặc restart service; đánh giá rủi ro quyền daemon. |
| `Can't find action.yml, action.yaml or Dockerfile` | `uses` trỏ sai thư mục, chưa checkout hoặc tên `Dockerfile` sai hoa/thường. | Checkout trước local action và trỏ `uses` đến thư mục chứa metadata/Dockerfile. |
| `COPY failed` hoặc `not found` khi build | File nằm ngoài build context hoặc bị `.dockerignore` loại. | Đặt file cạnh Dockerfile/trong context và kiểm tra rule ignore. |
| `exec ... permission denied` | Entrypoint thiếu executable bit. | `chmod +x`, `git update-index --chmod=+x` và xác nhận mode `100755`. |
| `exec format error` | Image sai kiến trúc, script có CRLF hoặc shebang hỏng. | Publish multi-arch image, đổi line ending sang LF và dùng `#!/bin/sh`. |
| `/bin/bash: not found` | Base image tối giản không có Bash. | Dùng POSIX `sh` hoặc cài Bash có version rõ ràng trong image. |
| Argument rỗng dù input là required | Metadata không tự validate input trống. | Đặt default hợp lý và kiểm tra `${1:-}` trong entrypoint. |
| `$GITHUB_SHA` được in nguyên văn | Exec-form ENTRYPOINT không chạy shell substitution trên argument. | Đọc biến trong script, hoặc chỉ mở shell có kiểm soát; không `eval` input. |
| `CMD` không có hiệu lực | `runs.args` thay thế Dockerfile `CMD`. | Chuyển default sang `inputs` hoặc bỏ `runs.args` nếu thật sự muốn dùng CMD. |
| Output rỗng ở step sau | Step action thiếu `id`, ghi sai file hoặc sai output ID. | Thêm `id`, append `name=value` vào `"$GITHUB_OUTPUT"` và dùng đúng `steps.<id>.outputs.<name>`. |
| `GITHUB_OUTPUT: parameter not set` khi test local | Chưa mô phỏng file command và biến môi trường. | Tạo file host, mount thư mục và đặt `GITHUB_OUTPUT` như phần local test. |
| Workspace không có source | Workflow chưa chạy checkout hoặc action đọc sai path. | Checkout trước, đọc `$GITHUB_WORKSPACE` và không giả định source nằm trong image. |
| `Permission denied` khi đọc workspace | Dockerfile đặt `USER` không được hỗ trợ cho use case này. | Bỏ `USER` và chạy bằng default root theo tài liệu GitHub. |
| Step sau không sửa/xóa được artifact | Container tạo file owner root. | `chown` đúng artifact về UID/GID owner workspace trước khi thoát. |
| File tạo trong container biến mất | File được ghi ngoài các mount bền vững. | Ghi artifact vào `$GITHUB_WORKSPACE` hoặc upload trong cùng logic trước khi container kết thúc. |
| `pull access denied` hoặc `unauthorized` | `docker://` trỏ image private/sai tên hoặc registry cần credential. | Dùng public image đúng ref; với private image, thiết kế workflow đăng nhập/pull rõ ràng thay vì `runs.image`. |
| `no matching manifest for linux/arm64` | Registry image không có kiến trúc runner. | Publish multi-platform manifest hoặc giới hạn `runs-on` vào kiến trúc được hỗ trợ. |
| Kết nối `localhost` bị từ chối | Server ở runner host hoặc container sibling, không ở action container. | Dùng service label trên shared job network hoặc truyền endpoint reachable đã kiểm thử. |
| Pull/build lỗi sau proxy | Docker daemon và container runtime chưa có proxy/DNS/CA phù hợp. | Cấu hình proxy/CA cho Docker daemon và truyền runtime proxy riêng; kiểm tra allowlist registry. |
| Build rất chậm ở mỗi run | Image lớn và GitHub-hosted runner không giữ cache qua job. | Thu nhỏ image/context hoặc publish image đã build và dùng `docker://`. |
| Disk self-hosted runner đầy | Layer/image/cache cũ không được prune. | Theo dõi dung lượng và áp dụng lịch `docker system prune` có kiểm soát khi không có job chạy. |
| Action local pass nhưng release fail | Tag không chứa Dockerfile/script mới hoặc major tag trỏ nhầm commit. | Kiểm tra file tại đúng ref, release từ commit đã test và xác minh tag trước khi publish. |

## Nguồn chính thức

- [Creating a Docker container action](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-a-docker-container-action)
- [Metadata syntax for Docker container actions](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runs-for-docker-container-actions)
- [Dockerfile support for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/dockerfile-support)
- [GitHub-hosted runners — Docker container filesystem](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#docker-container-filesystem)
- [Self-hosted runner requirements](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#requirements-for-self-hosted-runner-machines)
- [Workflow commands and environment files](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- [Variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
- [Setting exit codes for actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/set-exit-codes)
- [Running jobs in a container](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/run-jobs-in-a-container)
- [Creating PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Managing custom actions and releases](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)

## Tiếp tục trong series

<Cards>
  <Card title="Composite actions" href="/docs/tai-su-dung-actions/03-composite-actions/" description="Gộp các step shell và action có sẵn mà không cần build image." />
  <Card title="JavaScript actions" href="/docs/tai-su-dung-actions/04-javascript-actions/" description="Xây action đa nền tảng bằng Node.js, Toolkit và bundle dist." />
  <Card title="Action metadata" href="/docs/tai-su-dung-actions/06-action-metadata/" description="Tra cứu sâu inputs, outputs, runs và branding trong action.yml." />
  <Card title="Phát hành và version actions" href="/docs/tai-su-dung-actions/07-publish-version-actions/" description="Quản lý tag, release và chiến lược nâng cấp action an toàn." />
</Cards>
