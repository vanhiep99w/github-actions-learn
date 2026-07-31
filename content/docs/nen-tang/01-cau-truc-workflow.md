---
title: "Cấu trúc workflow"
description: "Hiểu vị trí file, các khóa cấp cao nhất, thứ bậc YAML và mô hình thực thi của một workflow GitHub Actions."
---

<Callout type="info" title="Bạn sẽ làm được gì?">
  Sau bài này, bạn có thể đọc một file workflow từ trên xuống, phân biệt cấu hình cấp workflow, job và step, rồi dự đoán thứ tự thực thi. Bạn cũng sẽ tạo một workflow hoàn chỉnh có ba job, quyền tối thiểu và kiểm soát chạy đồng thời.
</Callout>

## Mục lục

- [Workflow nằm ở đâu?](#workflow-nằm-ở-đâu)
  - [Đường dẫn và phần mở rộng](#đường-dẫn-và-phần-mở-rộng)
  - [Một repository có nhiều workflow](#một-repository-có-nhiều-workflow)
- [Cây cấu trúc và mô hình thực thi](#cây-cấu-trúc-và-mô-hình-thực-thi)
  - [Phân cấp YAML](#phân-cấp-yaml)
  - [Từ sự kiện đến step](#từ-sự-kiện-đến-step)
- [Các khóa cấp cao nhất](#các-khóa-cấp-cao-nhất)
  - [name](#name)
  - [run-name](#run-name)
  - [on](#on)
  - [permissions](#permissions)
  - [env](#env)
  - [defaults](#defaults)
  - [concurrency](#concurrency)
  - [jobs](#jobs)
- [Workflow hoàn chỉnh](#workflow-hoàn-chỉnh)
  - [Nội dung file](#nội-dung-file)
  - [Cách đọc lần chạy](#cách-đọc-lần-chạy)
- [Phạm vi và quy tắc ghi đè](#phạm-vi-và-quy-tắc-ghi-đè)
  - [Biến môi trường](#biến-môi-trường)
  - [Mặc định cho lệnh run](#mặc-định-cho-lệnh-run)
  - [Quyền và concurrency](#quyền-và-concurrency)
- [Bài thực hành](#bài-thực-hành)
  - [Yêu cầu](#yêu-cầu)
  - [Các bước thực hiện](#các-bước-thực-hiện)
  - [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Bước tiếp theo](#bước-tiếp-theo)
- [Tài liệu tham khảo chính thức](#tài-liệu-tham-khảo-chính-thức)

## Workflow nằm ở đâu?

Workflow là một quy trình tự động gồm một hoặc nhiều **job**. Job là một đơn vị công việc chạy trên runner, tức máy thực thi do GitHub hoặc bạn cung cấp. Mỗi workflow được mô tả bằng một file YAML trong repository.

### Đường dẫn và phần mở rộng

GitHub chỉ tìm file workflow trong thư mục sau:

```text
repository-root/
└── .github/
    └── workflows/
        ├── ci.yml
        ├── security.yaml
        └── release.yml
```

File phải có phần mở rộng `.yml` hoặc `.yaml`. Hãy đặt file trực tiếp trong `.github/workflows/`, không đặt trong thư mục con. Ví dụ hợp lệ là `.github/workflows/ci.yml`.

Tên file không quyết định trigger. Nội dung của khóa `on` mới quyết định sự kiện nào tạo lần chạy. Tên file ổn định vẫn hữu ích vì GitHub CLI, tài liệu nội bộ và badge có thể tham chiếu đến nó.

<Callout type="warn" title="Đúng file nhưng chưa chắc đã chạy">
  Một số trigger chỉ hoạt động khi file workflow tồn tại trên nhánh mặc định. Ví dụ phổ biến là `workflow_dispatch` và `schedule`. Hãy kiểm tra quy tắc của từng sự kiện trước khi kết luận rằng YAML bị sai.
</Callout>

### Một repository có nhiều workflow

Một repository có thể chứa nhiều file workflow. Mỗi file là một quy trình độc lập và có lịch sử run riêng. Ví dụ, `ci.yml` có thể chạy khi mở pull request, còn `release.yml` chỉ chạy khi đẩy tag.

Tách file theo mục đích khi chúng có trigger, quyền hoặc vòng đời khác nhau. Không nên dồn kiểm thử, phát hành và tác vụ bảo trì vào một file chỉ vì chúng cùng dùng GitHub Actions.

## Cây cấu trúc và mô hình thực thi

Một file workflow có hai lớp cần hiểu cùng lúc:

- **Lớp cấu hình:** các khóa YAML xác định trigger, quyền, biến và công việc.
- **Lớp thực thi:** GitHub biến cấu hình đó thành workflow run, job, runner và step.

### Phân cấp YAML

Khoảng trắng thể hiện quan hệ cha-con. GitHub Actions dùng **mapping** (tập khóa–giá trị) cho `jobs`, nhưng dùng **sequence** (danh sách có dấu `-`) cho `steps`.

```text
workflow file
├── name, run-name, on
├── permissions, env, defaults, concurrency
└── jobs                              mapping
    ├── validate-config               job ID
    │   ├── runs-on
    │   └── steps                     sequence
    │       ├── step 1: name + run
    │       └── step 2: name + uses
    └── summarize                     job ID
        ├── needs: validate-config
        ├── runs-on
        └── steps
            └── step 1: name + run
```

`validate-config` là ID của job. ID dùng để tham chiếu trong `needs` và biểu thức. `name` là nhãn hiển thị cho người đọc. Hai giá trị này không phải là một.

Mỗi phần tử trong `steps` thường chạy lệnh bằng `run` hoặc gọi action tái sử dụng bằng `uses`. Các step trong cùng job chạy tuần tự và dùng chung workspace của runner.

### Từ sự kiện đến step

Hãy đọc một lần chạy theo luồng sau:

```text
Sự kiện GitHub hoặc chạy thủ công
              │
              ▼
       Tạo workflow run
              │
              ▼
       Kiểm tra concurrency
              │
       ┌──────┴────────┐
       ▼               ▼
 job validate      job inspect       chạy song song
 runner riêng      runner riêng
 step 1 → step 2   step 1 → step 2   tuần tự trong từng job
       └──────┬────────┘
              ▼
        job summarize                 chờ do needs
              │
              ▼
        Kết luận của run
```

Mô hình thực thi cần nhớ:

1. Một sự kiện khớp `on` tạo một **workflow run**, tức một lần chạy cụ thể của file.
2. `concurrency` có thể cho run bắt đầu, chờ hoặc bị hủy khi trùng nhóm.
3. Các job không có quan hệ `needs` đủ điều kiện chạy song song.
4. Mỗi job trên GitHub-hosted runner nhận một máy ảo mới. File tạo ở job này không tự xuất hiện ở job khác.
5. Các step trong một job chạy theo thứ tự khai báo. Chúng dùng chung filesystem của job, nhưng mỗi step `run` là một tiến trình shell mới.
6. Nếu một step thất bại, các step sau trong job thường bị bỏ qua. Job phụ thuộc qua `needs` cũng thường bị bỏ qua, trừ khi bạn đặt điều kiện khác.

Muốn truyền dữ liệu giữa các job, hãy dùng job output cho giá trị nhỏ hoặc artifact cho file. Đừng dựa vào ổ đĩa của runner trước đó.

## Các khóa cấp cao nhất

Các khóa dưới đây nằm sát lề trái. Chúng áp dụng cho toàn workflow hoặc tạo các nhánh cấu hình lớn.

| Khóa | Bắt buộc | Vai trò |
|---|---:|---|
| `name` | Không | Tên workflow trong tab **Actions**. |
| `run-name` | Không | Tên của từng workflow run. Có thể dùng biểu thức được hỗ trợ. |
| `on` | Có | Khai báo sự kiện kích hoạt workflow. |
| `permissions` | Không | Giới hạn quyền của `GITHUB_TOKEN`. |
| `env` | Không | Đặt biến môi trường mặc định cho mọi job và step. |
| `defaults` | Không | Đặt mặc định cho các lệnh `run`. |
| `concurrency` | Không | Điều phối các run dùng chung một khóa đồng thời. |
| `jobs` | Có | Khai báo một hoặc nhiều job cần thực thi. |

### name

`name` là tên ổn định của workflow trên giao diện GitHub.

```yaml
name: Verify workflow structure
```

Nếu bỏ `name`, GitHub hiển thị đường dẫn tương đối của file. Nên đặt tên ngắn và mô tả mục đích, chẳng hạn `CI`, `Security scan` hoặc `Release`.

### run-name

`run-name` đặt nhãn cho từng lần chạy. Nó khác `name`: một workflow có một tên, nhưng tạo ra nhiều run với nhãn khác nhau.

```yaml
run-name: Verify · ${{ github.event_name }} · ${{ github.ref_name }}
```

Ví dụ trên giúp phân biệt run do `push` với run thủ công. Theo cú pháp hiện hành, `run-name` có thể tham chiếu context `github` và `inputs`. Context là đối tượng chứa dữ liệu của lần chạy.

### on

`on` khai báo trigger, tức sự kiện làm workflow bắt đầu.

```yaml
on:
  push:
  workflow_dispatch:
```

Cấu hình trên chạy khi có `push` và cho phép chạy bằng tay. Khi trộn sự kiện có cấu hình với sự kiện không có cấu hình, vẫn phải thêm dấu `:` cho từng sự kiện.

Ví dụ lọc pull request theo nhánh đích:

```yaml
on:
  pull_request:
    branches:
      - main
```

Trang này tập trung vào cấu trúc. Bộ lọc nhánh, đường dẫn và activity type được trình bày sâu hơn ở trang **Events và triggers**.

### permissions

Mỗi job có thể nhận `GITHUB_TOKEN`, một token tạm thời do GitHub tạo cho lần chạy. `permissions` thu hẹp quyền của token đó.

```yaml
permissions:
  contents: read
```

Workflow chỉ đọc metadata hoặc mã nguồn thường chỉ cần `contents: read`. Khi bạn khai báo ít nhất một quyền, các quyền không được nêu sẽ thành `none`. Nếu đặt `permissions` trong một job, cấu hình cấp job quyết định quyền cho riêng job đó.

<Callout type="warn" title="Quyền ghi cần lý do rõ ràng">
  Không dùng `write-all` để xử lý lỗi quyền. Chỉ cấp quyền ghi cụ thể, ví dụ `packages: write`, cho đúng job cần xuất bản package. Quyền thực tế vẫn bị giới hạn bởi chính sách repository hoặc tổ chức.
</Callout>

### env

`env` đặt biến môi trường ở cấp workflow. Job và step bên dưới nhận giá trị này nếu không ghi đè.

```yaml
env:
  DOCUMENT_KIND: workflow-structure
  VERIFY_MODE: standard
```

Trong shell Bash, đọc các giá trị bằng `$DOCUMENT_KIND` và `$VERIFY_MODE`. Không lưu password, token hoặc khóa riêng trong `env`; hãy dùng GitHub Secrets cho dữ liệu nhạy cảm.

### defaults

`defaults.run` đặt mặc định cho mọi step dùng `run`.

```yaml
defaults:
  run:
    shell: bash
```

Hai tùy chọn phổ biến là `shell` và `working-directory`. Mặc định này không áp dụng cho step dùng `uses`. `defaults.run` cấp job có độ ưu tiên cao hơn cấu hình cấp workflow.

### concurrency

`concurrency` nhóm các workflow run để tránh nhiều run cùng sửa một tài nguyên hoặc tiêu thụ runner cho commit đã cũ.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Với khóa trên, mỗi workflow và Git ref có một nhóm riêng. Khi commit mới đến cùng ref, run đang chạy bị hủy. Tên nhóm không phân biệt chữ hoa và chữ thường.

`cancel-in-progress: true` phù hợp với CI vì kết quả của commit cũ thường không còn cần thiết. Với deploy production, hủy giữa chừng có thể để hệ thống ở trạng thái dở dang. Khi đó, hãy dùng nhóm riêng và chọn cơ chế xếp hàng phù hợp thay vì sao chép cấu hình CI.

### jobs

`jobs` là mapping từ job ID đến cấu hình của từng job. Mỗi job phải xác định cách chọn runner, thường qua `runs-on`, hoặc gọi một reusable workflow.

```yaml
jobs:
  test:
    name: Run tests
    runs-on: ubuntu-latest
    steps:
      - name: Execute test command
        run: echo "test"
```

`test` là job ID. `Run tests` là tên hiển thị. Nếu thêm job `deploy` mà không có `needs: test`, GitHub có thể chạy `test` và `deploy` song song. Thứ tự xuất hiện trong file không tạo quan hệ phụ thuộc.

## Workflow hoàn chỉnh

Ví dụ dưới đây dùng lệnh shell có sẵn trên Ubuntu. Nó không checkout mã nguồn và không gọi action bên thứ ba. Vì vậy, bạn có thể chạy nó trong bất kỳ repository nào đã bật GitHub Actions.

### Nội dung file

Tạo `.github/workflows/structure-lab.yml` với nội dung sau:

```yaml
name: Verify workflow structure
run-name: Verify · ${{ github.event_name }} · ${{ github.ref_name }}

on:
  push:
  workflow_dispatch:

permissions:
  contents: read

env:
  DOCUMENT_KIND: workflow-structure
  VERIFY_MODE: standard

defaults:
  run:
    shell: bash

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate-config:
    name: Validate inherited configuration
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      SCOPE: job
    steps:
      - name: Verify workflow, job, and step scopes
        env:
          VERIFY_MODE: strict
        run: |
          test "$DOCUMENT_KIND" = "workflow-structure"
          test "$SCOPE" = "job"
          test "$VERIFY_MODE" = "strict"
          printf 'Environment precedence is valid.\n'

  inspect-context:
    name: Inspect runtime context
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Print built-in environment variables
        run: |
          printf 'Repository: %s\n' "$GITHUB_REPOSITORY"
          printf 'Event: %s\n' "$GITHUB_EVENT_NAME"
          printf 'Ref: %s\n' "$GITHUB_REF"

  summarize:
    name: Summarize the run
    needs:
      - validate-config
      - inspect-context
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Confirm dependency order
        run: printf 'Both prerequisite jobs completed successfully.\n'
```

Workflow này minh họa đủ tám khóa cấp cao nhất. Nó cũng cho thấy ba cấp `env`: workflow, job và step.

### Cách đọc lần chạy

GitHub tạo đồ thị gồm hai tầng:

1. `validate-config` và `inspect-context` không có `needs`, nên có thể chạy song song.
2. `summarize` có `needs` trỏ đến cả hai job, nên chỉ bắt đầu khi cả hai thành công.

Trong `validate-config`, giá trị `VERIFY_MODE` là `strict`. Biến ở step đã ghi đè giá trị `standard` của workflow. Biến `SCOPE` chỉ tồn tại trong job này. `inspect-context` không nhận `SCOPE`.

`permissions` và `defaults` nằm ở cấp workflow nên áp dụng cho cả ba job. `concurrency` kiểm soát toàn bộ workflow run, không chỉ một job.

## Phạm vi và quy tắc ghi đè

Một khóa đặt ở cấp cao giúp giảm lặp. Một khóa đặt ở cấp thấp giúp tùy chỉnh cục bộ. Khi cùng một loại cấu hình xuất hiện ở nhiều cấp, cấu hình cụ thể hơn thường thắng.

### Biến môi trường

Thứ tự ưu tiên của `env` là:

```text
step env  >  job env  >  workflow env
```

Ví dụ:

```yaml
env:
  MODE: workflow

jobs:
  example:
    runs-on: ubuntu-latest
    env:
      MODE: job
    steps:
      - name: Read job value
        run: test "$MODE" = "job"

      - name: Override for one step
        env:
          MODE: step
        run: test "$MODE" = "step"
```

Giá trị ghi vào biến shell trong một step không tự tồn tại ở step kế tiếp, vì mỗi step tạo tiến trình mới. Muốn lưu biến cho các step sau trong cùng job, hãy ghi theo cú pháp hỗ trợ vào file được chỉ bởi `$GITHUB_ENV`.

### Mặc định cho lệnh run

Bạn có thể đặt `defaults.run` ở workflow và ghi đè trong một job:

```yaml
defaults:
  run:
    shell: bash

jobs:
  powershell-check:
    runs-on: windows-latest
    defaults:
      run:
        shell: pwsh
    steps:
      - run: Write-Output "PowerShell applies in this job"
```

Cấu hình job chỉ ảnh hưởng job `powershell-check`. Một step vẫn có thể đặt `shell` hoặc `working-directory` riêng. Không dùng context hoặc biểu thức trong `defaults.run`; nếu cần giá trị động, hãy cấu hình trực tiếp tại step.

### Quyền và concurrency

`permissions` có thể xuất hiện ở cấp workflow hoặc job. Khi job khai báo `permissions`, hãy liệt kê đầy đủ quyền job cần. Đừng giả định GitHub sẽ ghép sâu từng quyền với mapping cấp workflow.

`concurrency` cũng có hai vị trí nhưng ý nghĩa khác nhau:

- Cấp workflow điều phối toàn bộ workflow run.
- Cấp job chỉ điều phối các job có cùng concurrency group.

Tên concurrency group được dùng chung trong repository. Hãy thêm `${{ github.workflow }}` vào group nếu các workflow không được phép hủy lẫn nhau.

## Bài thực hành

Bài thực hành tập trung vào thứ bậc và đồ thị job. Bạn không cần cài dependency hoặc dùng dự án mẫu.

### Yêu cầu

Bạn cần một repository có GitHub Actions đang bật và quyền ghi vào repository. Dùng file `.github/workflows/structure-lab.yml` trong phần [Workflow hoàn chỉnh](#workflow-hoàn-chỉnh).

### Các bước thực hiện

1. Tạo file và sao chép nguyên workflow hoàn chỉnh.
2. Commit rồi push lên một nhánh bất kỳ. Hoặc chạy bằng nút **Run workflow** sau khi file đã có trên nhánh mặc định.
3. Mở **Actions → Verify workflow structure** và xem đồ thị job.
4. Mở log `validate-config`. Xác nhận có dòng `Environment precedence is valid.`.
5. Mở log `inspect-context`. Đối chiếu repository, event và ref với lần chạy hiện tại.
6. Mở log `summarize`. Xác nhận job chỉ bắt đầu sau hai job còn lại.
7. Tạo hai commit nhỏ và push nhanh liên tiếp vào cùng nhánh. Quan sát `concurrency` hủy run cũ nếu run đó vẫn đang chạy.
8. Để thử quan hệ phụ thuộc, tạm xóa `inspect-context` khỏi danh sách `needs` của `summarize`. Push lại và so sánh đồ thị, sau đó khôi phục cấu hình.

<Callout type="info" title="Run quá nhanh để quan sát hủy">
  Ba job có thể hoàn tất trước lần push thứ hai. Đây không phải lỗi. Bạn vẫn có thể kiểm tra concurrency group trong file và quan sát lại trên một workflow thực tế chạy lâu hơn; không nên thêm lệnh `sleep` dài chỉ để tạo tải giả.
</Callout>

### Tiêu chí kiểm chứng

| Tiêu chí | Bằng chứng cần thấy |
|---|---|
| GitHub nhận file | Workflow **Verify workflow structure** xuất hiện trong tab **Actions**. |
| Trigger hoạt động | Push tạo một workflow run, hoặc `workflow_dispatch` tạo run thủ công. |
| Cấu trúc song song đúng | `validate-config` và `inspect-context` ở cùng tầng đầu của đồ thị. |
| Quan hệ phụ thuộc đúng | `summarize` nằm sau và nối với cả hai job đầu. |
| Phạm vi `env` đúng | Cả ba lệnh `test` thành công và log in `Environment precedence is valid.`. |
| Context runtime đúng | Log hiển thị đúng repository, event và Git ref. |
| Toàn bộ workflow hợp lệ | Cả ba job và workflow run có kết luận **Success**. |

## Best practices

- **Đặt tên theo mục đích:** dùng `name` cho workflow, `name` cho job và `name` cho step. Giữ job ID ngắn, ổn định và dùng `kebab-case`, ví dụ `unit-test`.
- **Khai báo quyền tối thiểu:** đặt `permissions` ở cấp workflow, rồi chỉ nâng quyền tại job thực sự cần ghi.
- **Biểu diễn phụ thuộc bằng `needs`:** không dựa vào thứ tự job trong file. Nếu deploy cần test thành công, hãy viết `needs: test`.
- **Đặt timeout:** dùng `timeout-minutes` cho từng job. Một lệnh treo không nên giữ runner đến giới hạn mặc định.
- **Tách cấu hình chung:** dùng `env` và `defaults` cấp workflow cho giá trị thực sự dùng chung. Không đưa mọi thứ lên cấp workflow nếu chỉ một job cần.
- **Kiểm soát chạy trùng:** dùng `concurrency` cho CI theo nhánh và cho deploy theo environment. Chọn chính sách hủy hoặc xếp hàng theo mức an toàn của tác vụ.
- **Giữ workflow dễ đọc:** một file nên có một mục đích chính. Khi logic shell dài, chuyển nó sang script được kiểm thử trong repository.
- **Không truyền dữ liệu qua runner ngầm:** dùng output, cache hoặc artifact đúng mục đích. Job mới không nên phụ thuộc file cục bộ của job trước.
- **Không chèn dữ liệu không tin cậy trực tiếp vào shell:** chuyển dữ liệu từ context qua biến môi trường rồi quote biến trong lệnh. Cách này giảm rủi ro script injection.
- **Pin action có chủ đích:** với action bên thứ ba, full-length commit SHA là lựa chọn bất biến. Dùng Dependabot để theo dõi phiên bản mới.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Workflow không xuất hiện trong tab **Actions** | File sai đường dẫn, sai phần mở rộng hoặc YAML không hợp lệ. | Xác nhận file là `.github/workflows/structure-lab.yml` và không nằm trong thư mục con. Kiểm tra tab **Actions** hoặc thông báo validation trên commit. |
| Push không tạo run | Sự kiện không khớp `on`, bộ lọc nhánh/đường dẫn loại commit, hoặc Actions bị tắt. | Đọc lại `on`, kiểm tra **Settings → Actions → General** và thử `workflow_dispatch` trên nhánh mặc định. |
| Không thấy nút **Run workflow** | Thiếu `workflow_dispatch`, file chưa có trên nhánh mặc định hoặc người dùng thiếu quyền ghi. | Thêm trigger, đưa file lên nhánh mặc định và kiểm tra quyền repository. |
| GitHub báo lỗi quanh `steps` | `steps` không phải danh sách hoặc đặt sai cấp thụt lề. | Đặt `steps` bên trong một job và thêm `-` trước từng step. Không dùng tab trong YAML. |
| Hai job chạy tuần tự dù không có `needs` | Thiếu runner khả dụng, giới hạn concurrency hoặc giới hạn sử dụng của tài khoản/tổ chức. | Kiểm tra hàng đợi runner và concurrency group. “Có thể song song” không có nghĩa luôn bắt đầu cùng mili-giây. |
| Job `summarize` bị skipped | Một job trong `needs` thất bại hoặc bị bỏ qua. | Mở job tiền đề đầu tiên không thành công. Sửa lỗi đó, hoặc dùng điều kiện có chủ đích nếu summary phải luôn chạy. |
| Biến đặt trong một step mất ở step sau | Mỗi step `run` dùng một tiến trình mới. | Ghi biến vào `$GITHUB_ENV` để dùng trong các step sau của cùng job; dùng output nếu cần qua job khác. |
| Job sau không thấy file của job trước | Các job không dùng chung filesystem. | Upload/download artifact, hoặc tái tạo file trong job sau. |
| Run cũ bị hủy ngoài ý muốn | Hai run hoặc hai workflow dùng cùng concurrency group với `cancel-in-progress: true`. | Làm group cụ thể hơn, thường bằng `${{ github.workflow }}-${{ github.ref }}`; đổi chính sách cho deploy. |
| `Permission denied` khi gọi GitHub API | `GITHUB_TOKEN` thiếu scope hoặc chính sách repository hạn chế quyền ghi. | Cấp đúng quyền tại job cần dùng và kiểm tra **Settings → Actions → General**. Không chuyển sang `write-all`. |

## Bước tiếp theo

<Cards>
  <Card title="YAML cho GitHub Actions" href="/docs/nen-tang/02-yaml-cho-github-actions/" description="Nắm quy tắc thụt lề, mapping, sequence và các lỗi YAML thường gặp." />
  <Card title="Events và triggers" href="/docs/nen-tang/03-events-va-triggers/" description="Cấu hình sự kiện, activity type và bộ lọc nhánh hoặc đường dẫn." />
  <Card title="Jobs và steps" href="/docs/nen-tang/04-jobs-va-steps/" description="Đi sâu vào phụ thuộc, điều kiện và cách tổ chức đơn vị thực thi." />
  <Card title="Contexts" href="/docs/nen-tang/07-contexts/" description="Đọc dữ liệu động của repository, event, job và runner." />
</Cards>

## Tài liệu tham khảo chính thức

- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Understanding GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions)
- [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [Variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
- [Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
