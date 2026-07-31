---
title: "Actions"
description: "Hiểu action là đơn vị tái sử dụng được gọi bằng uses, cách truyền dữ liệu, chọn loại action và sử dụng an toàn trong workflow."
---

<Callout type="info" title="Bạn sẽ làm được gì?">
  Sau bài này, bạn có thể đọc một step dùng `uses`, phân biệt action với workflow tái sử dụng, chọn đúng loại custom action và tự tạo một composite action có input, output. Bạn cũng sẽ biết action được thực thi ở đâu và cách giảm rủi ro chuỗi cung ứng.
</Callout>

## Mục lục

- [Action là gì?](#action-là-gì)
  - [Mô hình tái sử dụng](#mô-hình-tái-sử-dụng)
  - [Phân biệt action, workflow và reusable workflow](#phân-biệt-action-workflow-và-reusable-workflow)
- [Cú pháp uses](#cú-pháp-uses)
  - [Action từ GitHub Marketplace hoặc repository khác](#action-từ-github-marketplace-hoặc-repository-khác)
  - [Action trong cùng repository](#action-trong-cùng-repository)
  - [Docker image công khai](#docker-image-công-khai)
- [Truyền dữ liệu bằng inputs và outputs](#truyền-dữ-liệu-bằng-inputs-và-outputs)
  - [Truyền input với with](#truyền-input-với-with)
  - [Đọc output của action](#đọc-output-của-action)
- [Action được tải và chạy ở đâu?](#action-được-tải-và-chạy-ở-đâu)
- [Ba loại custom action](#ba-loại-custom-action)
  - [JavaScript action](#javascript-action)
  - [Docker container action](#docker-container-action)
  - [Composite action](#composite-action)
  - [Chọn loại nào?](#chọn-loại-nào)
- [Giải phẫu action.yml](#giải-phẫu-actionyml)
  - [Các khóa chính](#các-khóa-chính)
  - [Một composite action có thể dùng ngay](#một-composite-action-có-thể-dùng-ngay)
- [Workflow sử dụng action](#workflow-sử-dụng-action)
- [Phiên bản và bảo mật chuỗi cung ứng](#phiên-bản-và-bảo-mật-chuỗi-cung-ứng)
  - [Tag, branch và full commit SHA](#tag-branch-và-full-commit-sha)
  - [Quyền tối thiểu](#quyền-tối-thiểu)
  - [Kiểm soát dependency action](#kiểm-soát-dependency-action)
- [Bài thực hành](#bài-thực-hành)
  - [Chuẩn bị](#chuẩn-bị)
  - [Tạo action và workflow](#tạo-action-và-workflow)
  - [Chạy và quan sát](#chạy-và-quan-sát)
  - [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Bước tiếp theo](#bước-tiếp-theo)
- [Tài liệu tham khảo chính thức](#tài-liệu-tham-khảo-chính-thức)

## Action là gì?

**Action** là một tác vụ độc lập có thể tái sử dụng trong GitHub Actions. Ví dụ, một action có thể checkout mã nguồn, cài Node.js, đăng nhập vào cloud hoặc gom nhiều lệnh kiểm tra thành một bước duy nhất.

Trong workflow, action thường được gọi tại một step bằng khóa `uses`:

```yaml
steps:
  - name: Lấy mã nguồn
    uses: actions/checkout@v6
```

`actions/checkout` là action. `@v6` chọn phiên bản sẽ dùng. Toàn bộ dòng `uses` khai báo một dependency có mã được thực thi trong job.

Một step dùng `run` không tự động trở thành action:

```yaml
steps:
  - name: Chạy kiểm thử
    run: npm test
```

Step này chỉ chạy lệnh trong một workflow. Muốn tái sử dụng nó như action, bạn cần đóng gói mã và khai báo metadata bằng `action.yml` hoặc `action.yaml`.

### Mô hình tái sử dụng

Có thể hình dung vị trí của action như sau:

```text
Workflow run
└── Job trên runner
    ├── Step dùng uses → Action
    ├── Step dùng run  → Lệnh shell
    └── Step dùng uses → Action khác
```

Action chạy trong ngữ cảnh của job gọi nó. Action không tự chọn trigger và thường không tự chọn runner. Workflow quyết định khi nào chạy, job quyết định runner nào thực thi, còn action đóng gói công việc của một step.

### Phân biệt action, workflow và reusable workflow

GitHub dùng `uses` cho cả action và **reusable workflow** — workflow được thiết kế để workflow khác gọi lại. Vị trí của `uses` quyết định loại đơn vị đang được gọi.

| Thành phần | Nơi khai báo | Nơi gọi | Chứa được gì? | Dùng khi nào? |
|---|---|---|---|---|
| Action | Thư mục có `action.yml` hoặc `action.yaml` | `jobs.<job_id>.steps[*].uses` | Một tác vụ; composite action có nhiều step nhưng không có job | Tái sử dụng logic ở cấp step |
| Workflow thông thường | `.github/workflows/*.yml` | Được trigger bởi `push`, `pull_request`, `workflow_dispatch`... | Một hoặc nhiều job | Mô tả toàn bộ quy trình tự động |
| Reusable workflow | `.github/workflows/*.yml` có `on.workflow_call` | `jobs.<job_id>.uses` | Một hoặc nhiều job, runner, permissions, secrets và outputs | Tái sử dụng cả pipeline hoặc một giai đoạn nhiều job |

Action được gọi **bên trong `steps`**:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
```

Reusable workflow được gọi **trực tiếp ở cấp job**:

```yaml
jobs:
  call-ci:
    uses: octo-org/automation/.github/workflows/ci.yml@v2
```

<Callout type="idea" title="Quy tắc chọn nhanh">
  Nếu cần gói một chuỗi step thành một step, hãy dùng composite action. Nếu cần nhiều job, runner khác nhau, environment hoặc luồng phụ thuộc giữa các job, hãy dùng reusable workflow.
</Callout>

## Cú pháp uses

`uses` không chạy một tên tùy ý. Giá trị của nó phải trỏ đến repository/thư mục chứa metadata action hoặc đến một Docker image được hỗ trợ.

### Action từ GitHub Marketplace hoặc repository khác

Cú pháp tổng quát cho action nằm ở repository GitHub là:

```yaml
uses: OWNER/REPOSITORY@REF
```

Ví dụ từ Marketplace:

```yaml
- name: Lấy mã nguồn
  uses: actions/checkout@v6
```

Marketplace là nơi khám phá action và sao chép cú pháp cài đặt. Action vẫn được phát hành từ một repository GitHub; Marketplace không phải runner và không phải registry thực thi riêng.

Nếu repository chứa nhiều action trong các thư mục con, thêm đường dẫn trước `@REF`:

```yaml
- name: Khởi tạo một action trong monorepo
  uses: OWNER/REPOSITORY/path/to/action@REF
```

`REF` có thể là release tag, branch hoặc full commit SHA. Với action bên thứ ba dùng trong production, full commit SHA là lựa chọn an toàn nhất.

Một public action không bắt buộc phải được niêm yết trên Marketplace mới có thể được gọi. Với action private, khả năng chia sẻ phụ thuộc mức hiển thị repository và thiết lập truy cập GitHub Actions của user hoặc organization.

### Action trong cùng repository

Trên GitHub.com hiện hành, cách được khuyến nghị là self-repository reference bắt đầu bằng `$/`:

```yaml
steps:
  - name: Gọi action ở đúng commit đang chạy
    uses: $/.github/actions/greet
```

Cú pháp này lấy action từ cùng repository và cùng commit với workflow run. Không cần checkout repository trước. Không thêm `@ref` vào cuối. `$/` chưa được hỗ trợ trên GitHub Enterprise Server.

Cách tương thích rộng hơn là đường dẫn tương đối `./`:

```yaml
steps:
  - name: Checkout repository
    uses: actions/checkout@v6

  - name: Gọi local action từ workspace
    uses: ./.github/actions/greet
```

`./.github/actions/greet` được tính từ `$GITHUB_WORKSPACE`. Vì workspace ban đầu chưa có mã nguồn repository, phải checkout trước. Nếu checkout vào một thư mục khác qua input `path`, đường dẫn local action cũng phải đổi theo.

Cả hai cách đều trỏ đến **thư mục chứa `action.yml`**, không trỏ trực tiếp đến file metadata. Cú pháp sau là sai:

```yaml
uses: ./.github/actions/greet/action.yml
```

### Docker image công khai

Một step có thể gọi trực tiếp image công khai trên Docker Hub:

```yaml
- name: Chạy lệnh trong Alpine
  uses: docker://alpine:3.8
  with:
    args: /bin/sh -c "printf 'Xin chao tu container\n'"
```

Cú pháp là:

```yaml
uses: docker://IMAGE:TAG
```

Hãy kiểm tra nguồn, Dockerfile và tính toàn vẹn của image trước khi dùng. Image theo tag có cùng rủi ro tag bị thay đổi như action theo Git tag. Docker container action chỉ chạy trên runner Linux; self-hosted runner còn phải cài Docker.

## Truyền dữ liệu bằng inputs và outputs

Input là dữ liệu caller truyền vào action. Output là dữ liệu action công bố để các step phía sau dùng tiếp. Hợp đồng input/output được mô tả trong `action.yml` của action.

### Truyền input với with

`with` là map các cặp khóa–giá trị. Tên khóa phải khớp ID input mà action công bố:

```yaml
- name: Cài Node.js
  uses: actions/setup-node@v7
  with:
    node-version: "24"
    cache: npm
```

Đọc README và `action.yml` của đúng phiên bản trước khi truyền input. Một input có thể đổi tên hoặc đổi hành vi giữa các major version.

Nên đặt chuỗi trong dấu nháy khi YAML có thể hiểu nhầm kiểu, chẳng hạn phiên bản, giá trị `yes`, `no`, `on`, `off` hoặc số có định dạng đặc biệt.

JavaScript action thường đọc input qua `@actions/core.getInput()`. Docker action có thể nhận input qua `args`. Composite action nên đọc bằng context `inputs`, ví dụ `${{ inputs.who }}`; GitHub không tự tạo biến `INPUT_*` cho composite action.

<Callout type="warn" title="required không tự xác thực">
  Trong metadata action, `required: true` mô tả rằng input là bắt buộc nhưng GitHub không tự động làm action thất bại khi caller bỏ trống. Action nên tự kiểm tra giá trị và trả mã thoát khác `0` với thông báo rõ ràng.
</Callout>

### Đọc output của action

Để tham chiếu output, step gọi action phải có `id`:

```yaml
steps:
  - name: Tạo lời chào
    id: greet
    uses: ./.github/actions/greet
    with:
      who: "Nhóm CI"

  - name: Dùng output
    env:
      MESSAGE: ${{ steps.greet.outputs.message }}
    run: |
      printf 'Action trả về: %s\n' "$MESSAGE"
```

Cú pháp đọc là:

```text
steps.<step_id>.outputs.<output_id>
```

`id: greet` là định danh dùng trong expression. `name: Tạo lời chào` chỉ là nhãn hiển thị trong log và không dùng để tham chiếu.

Mã action đặt output bằng cách ghi vào file môi trường `$GITHUB_OUTPUT`. Composite action còn phải ánh xạ output của step nội bộ ra output cấp action bằng khóa `outputs.<id>.value`.

Không dùng output để truyền secret nếu có thể tránh. Output có thể đi vào log hoặc được các step sau xử lý ngoài dự kiến.

## Action được tải và chạy ở đâu?

Action chạy trên **runner của job gọi nó**, không chạy trên Marketplace hay máy chủ của tác giả action.

Luồng điển hình là:

```text
GitHub lập lịch job
        ↓
Runner nhận job và chuẩn bị workspace
        ↓
Runner lấy action theo uses
        ↓
Runner thực thi JavaScript, composite steps hoặc container
        ↓
Step sau đọc file và output trong cùng job
```

Cách thực thi phụ thuộc loại action:

- **Action từ repository khác:** runner tải package mã nguồn tại `REF` trong lúc chạy. JavaScript action phải chứa sẵn mã đã bundle và dependency cần thiết; GitHub không tự chạy `npm install` cho action.
- **Action cùng repository qua `$/`:** GitHub lấy action ở commit đang chạy mà không cần checkout toàn repository vào workspace trước.
- **Local action qua `./`:** runner đọc action từ `$GITHUB_WORKSPACE`, vì vậy step checkout phải chạy trước.
- **JavaScript action:** runtime Node.js được khai báo trong metadata chạy trực tiếp trên runner.
- **Composite action:** các lệnh và action con chạy tuần tự trên cùng runner, dùng workspace của job gọi.
- **Docker action:** runner pull image hoặc build `Dockerfile`, sau đó chạy action trong container. `$GITHUB_WORKSPACE` trên runner được ánh xạ vào `/github/workspace` trong container.

Trên GitHub-hosted runner, mỗi job thường nhận một máy ảo mới và máy bị hủy sau job. Self-hosted runner có thể giữ file hoặc tiến trình nếu không dọn dẹp đúng cách.

<Callout type="warn" title="Action là mã có quyền thực thi">
  Action có thể đọc workspace, biến môi trường và mọi secret bạn truyền cho nó. Action cũng có thể dùng `github.token` trong phạm vi quyền của job ngay cả khi workflow không truyền token qua `with`. Hãy xem action như một dependency thực thi, không phải đoạn cấu hình vô hại.
</Callout>

## Ba loại custom action

GitHub hỗ trợ ba loại action: JavaScript, Docker container và composite. Cả ba đều cần metadata `action.yml` hoặc `action.yaml`; GitHub ưu tiên tên `action.yml`.

### JavaScript action

JavaScript action chạy trực tiếp trên runner bằng runtime Node.js do metadata chỉ định:

```yaml
runs:
  using: node24
  main: dist/index.js
```

Loại này khởi động nhanh và có thể chạy trên Ubuntu, Windows, macOS. Để tương thích đa nền tảng, mã nên là JavaScript thuần và không phụ thuộc binary chỉ có trên một hệ điều hành.

Hãy chọn JavaScript action khi cần:

- gọi GitHub API hoặc API ngoài bằng logic tương đối phức tạp;
- xử lý lỗi, input và output có cấu trúc;
- tốc độ khởi động nhanh;
- hỗ trợ cả ba hệ điều hành runner.

Tác giả action nên dùng `@actions/core`, `@actions/github` khi phù hợp. Mã phát hành phải bundle dependency vào `dist/` bằng công cụ như Rollup hoặc `@vercel/ncc`, rồi commit artifact đã bundle.

### Docker container action

Docker action đóng gói hệ điều hành, công cụ và dependency vào image:

```yaml
runs:
  using: docker
  image: Dockerfile
  args:
    - ${{ inputs.who }}
```

GitHub build `Dockerfile` rồi chạy entrypoint trong container. Loại này tạo môi trường nhất quán nhưng chậm hơn do thời gian build hoặc pull image.

Hãy chọn Docker action khi cần:

- phiên bản hệ điều hành hoặc dependency được kiểm soát chặt;
- binary, package hệ thống hoặc ngôn ngữ không có sẵn trên runner;
- môi trường cô lập và có thể tái tạo bằng container.

Docker action chỉ hỗ trợ runner Linux. Self-hosted runner phải có Docker đang hoạt động.

### Composite action

Composite action gộp nhiều step `run` và `uses` thành một action:

```yaml
runs:
  using: composite
  steps:
    - shell: bash
      run: echo "Một step nội bộ"
    - uses: actions/checkout@v6
```

Loại này không cần bundle JavaScript hay build image. Nó phù hợp để chuẩn hóa một chuỗi lệnh đã có trong workflow.

Hãy chọn composite action khi cần:

- gom các bước setup, lint hoặc kiểm tra thường lặp lại;
- giữ logic chủ yếu là shell và action có sẵn;
- tạo nhanh một API input/output ở cấp step;
- chạy ngay trên môi trường của caller.

Composite action không chứa job và không tự chọn `runs-on`. Mỗi step `run` trong metadata phải khai báo `shell`. Khi cần gọi script đi kèm action, dùng `${{ github.action_path }}` thay vì giả định script nằm ở workspace của caller.

### Chọn loại nào?

| Nhu cầu chính | Lựa chọn phù hợp | Đánh đổi cần biết |
|---|---|---|
| Gộp vài lệnh và action có sẵn | Composite | Phụ thuộc shell/công cụ của runner; log hiển thị chủ yếu như một step của caller |
| Logic API, parsing, validation phức tạp | JavaScript | Phải bundle và cập nhật runtime Node.js |
| Cần OS/package/binary cố định | Docker | Chỉ Linux và khởi động chậm hơn |
| Cần nhiều job hoặc runner khác nhau | Reusable workflow, không phải action | Được gọi ở cấp job thay vì cấp step |

Nói ngắn gọn: bắt đầu bằng composite khi chỉ đang loại bỏ lặp step. Chuyển sang JavaScript khi shell trở nên khó kiểm thử. Dùng Docker khi môi trường thực thi là một phần bắt buộc của hợp đồng.

## Giải phẫu action.yml

Metadata phải nằm ngay trong thư mục mà `uses` trỏ đến. Hai tên được hỗ trợ là `action.yml` và `action.yaml`; `action.yml` là tên được GitHub khuyến nghị.

### Các khóa chính

| Khóa | Bắt buộc? | Vai trò |
|---|---|---|
| `name` | Có | Tên action hiển thị trong giao diện |
| `description` | Có | Mô tả ngắn về tác vụ |
| `author` | Không | Tên tác giả hoặc tổ chức |
| `inputs` | Không | Hợp đồng dữ liệu caller có thể truyền bằng `with` |
| `outputs` | Không | Hợp đồng dữ liệu step sau có thể đọc |
| `runs` | Có | Loại action và cách GitHub khởi động action |
| `branding` | Không | Icon và màu cho listing Marketplace |

Giá trị `runs` thay đổi theo loại:

```yaml
# JavaScript
runs:
  using: node24
  main: dist/index.js
  pre: dist/setup.js
  post: dist/cleanup.js
```

```yaml
# Docker
runs:
  using: docker
  image: Dockerfile
  entrypoint: /entrypoint.sh
  args:
    - ${{ inputs.target }}
```

```yaml
# Composite
runs:
  using: composite
  steps:
    - shell: bash
      run: echo "Hello"
```

`pre` và `post` hữu ích cho setup/dọn dẹp của JavaScript action. Docker có các khóa tương ứng cho entrypoint. Composite mô tả trực tiếp danh sách step.

### Một composite action có thể dùng ngay

Tạo file `.github/actions/greet/action.yml`:

```yaml
name: "Lời chào có output"
description: "Tạo một lời chào và công bố kết quả cho step tiếp theo"
author: "Platform Team"

inputs:
  who:
    description: "Tên người hoặc nhóm cần chào"
    required: false
    default: "GitHub Actions"

outputs:
  message:
    description: "Lời chào hoàn chỉnh"
    value: ${{ steps.compose.outputs.message }}

runs:
  using: composite
  steps:
    - name: Tạo lời chào
      id: compose
      shell: bash
      env:
        WHO: ${{ inputs.who }}
      run: |
        if [[ -z "$WHO" || "$WHO" == *$'\n'* || "$WHO" == *$'\r'* ]]; then
          echo "::error::Input 'who' phải là chuỗi một dòng và không được rỗng."
          exit 1
        fi

        message="Xin chào, ${WHO}!"
        printf '%s\n' "$message"
        printf 'message=%s\n' "$message" >> "$GITHUB_OUTPUT"
```

Ví dụ này có đủ năm phần quan trọng:

1. `inputs.who` công bố input và giá trị mặc định.
2. Step `compose` đọc input qua biến môi trường `WHO` thay vì chèn trực tiếp expression vào script.
3. Khối `if` từ chối chuỗi rỗng hoặc nhiều dòng trước khi tạo output một dòng.
4. Step ghi `message=...` vào `$GITHUB_OUTPUT`.
5. `outputs.message.value` ánh xạ output nội bộ thành output công khai của action.

Đưa expression vào `env`, validate dữ liệu rồi dùng biến đã quote giúp giảm rủi ro script injection và output injection. Nếu action cần chấp nhận dữ liệu nhiều dòng, hãy dùng cú pháp multiline của environment file với delimiter không thể xung đột dữ liệu.

## Workflow sử dụng action

Tạo `.github/workflows/test-local-action.yml` với nội dung sau:

```yaml
name: Test local action

on:
  push:
    paths:
      - ".github/actions/greet/**"
      - ".github/workflows/test-local-action.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test-greet:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Gọi composite action
        id: greet
        uses: ./.github/actions/greet
        with:
          who: "Nhóm CI"

      - name: Kiểm chứng output
        shell: bash
        env:
          MESSAGE: ${{ steps.greet.outputs.message }}
        run: |
          printf 'Output: %s\n' "$MESSAGE"
          test "$MESSAGE" = "Xin chào, Nhóm CI!"
```

Workflow dùng `./`, nên checkout phải đứng trước local action. Nếu chỉ chạy trên GitHub.com, bạn có thể bỏ step checkout và đổi dòng gọi thành:

```yaml
uses: $/.github/actions/greet
```

Step **Kiểm chứng output** vừa hiển thị kết quả vừa tạo assertion. Nếu output sai hoặc rỗng, lệnh `test` trả mã khác `0` và job thất bại.

## Phiên bản và bảo mật chuỗi cung ứng

Mỗi action bên thứ ba là mã chạy trong job của bạn. Nếu dependency bị chiếm quyền hoặc ref trỏ sang mã độc, attacker có thể đọc workspace, đánh cắp secret được cấp và sử dụng quyền của `GITHUB_TOKEN`.

### Tag, branch và full commit SHA

Có bốn cách tham chiếu thường gặp:

```yaml
# Major tag: tiện cập nhật bản sửa tương thích, nhưng tag có thể bị di chuyển
uses: actions/checkout@v6

# Release tag cụ thể: ít thay đổi ngoài ý muốn hơn, nhưng tag vẫn có thể bị di chuyển
uses: actions/checkout@v6.2.0

# Full commit SHA: tham chiếu bất biến và an toàn nhất
uses: actions/javascript-action@a824008085750b8e136effc585c3cd6082bd575f

# Branch: luôn trỏ đến trạng thái hiện tại của branch, rủi ro cao nhất
uses: actions/javascript-action@main
```

Theo GitHub, pin vào **full-length commit SHA** hiện là cách duy nhất để dùng một action như một bản phát hành bất biến. Hãy xác nhận SHA thuộc repository gốc, không phải fork. Sau khi đối chiếu SHA với release của nhà phát hành, có thể ghi tên release trong comment cùng dòng để người review dễ kiểm tra. Không dùng abbreviated SHA.

Tag thuận tiện và phổ biến, nhưng maintainer hoặc attacker có quyền repository có thể di chuyển tag. Chỉ dùng tag khi bạn tin cậy nhà phát hành và chấp nhận tự động nhận thay đổi trong phạm vi tag đó. Tránh `@main` trong workflow production.

<Callout type="warn" title="Verified creator không phải bảo đảm tuyệt đối">
  Badge “Creator verified by GitHub” xác nhận danh tính tổ chức phát hành và là một tín hiệu hữu ích. Badge không thay thế việc đọc source, kiểm tra release, pin full SHA và giới hạn quyền token.
</Callout>

### Quyền tối thiểu

Khai báo `permissions` rõ ràng ở workflow hoặc job. Workflow chỉ đọc source thường chỉ cần:

```yaml
permissions:
  contents: read
```

Nếu job không cần `GITHUB_TOKEN`, có thể tắt mọi quyền:

```yaml
permissions: {}
```

Chỉ nâng quyền tại job thực sự cần ghi:

```yaml
jobs:
  publish:
    permissions:
      contents: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/javascript-action@a824008085750b8e136effc585c3cd6082bd575f
```

Khi một hoặc nhiều quyền được khai báo cụ thể, các quyền không nêu ra được đặt thành `none`. Tránh `write-all`. Truyền `${{ secrets.GITHUB_TOKEN }}` qua `with` không làm token hẹp quyền hơn; `permissions` mới quyết định phạm vi token.

Với cloud deployment, ưu tiên OpenID Connect và credential sống ngắn thay cho access key lưu lâu dài. Không in token hoặc output nhạy cảm vào log.

### Kiểm soát dependency action

Áp dụng nhiều lớp kiểm soát thay vì chỉ dựa vào một tín hiệu:

- ưu tiên action chính chủ hoặc nhà phát hành đáng tin cậy;
- đọc `action.yml`, source, script `pre`/`post`, dependency và release notes;
- pin action bên thứ ba bằng full SHA;
- bảo vệ `.github/workflows/` và thư mục local action bằng `CODEOWNERS`;
- dùng allowlist action ở cấp repository hoặc organization nếu có;
- bật dependency graph, Dependabot và dependency review;
- không checkout mã không tin cậy trong job đặc quyền dùng `pull_request_target`;
- tách job đọc mã PR khỏi job có secret hoặc quyền ghi.

Dependabot có thể mở pull request cập nhật GitHub Actions. File `.github/dependabot.yml` tối thiểu là:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
```

Dependabot hỗ trợ action theo cú pháp repository GitHub, kể cả ref SHA. Dependabot không cập nhật local action qua `./` và không theo dõi image `docker://`.

## Bài thực hành

Bài thực hành dùng composite action ở phần trên. Bạn không cần cài Node.js hay Docker trên máy cá nhân.

### Chuẩn bị

Bạn cần:

- một repository mà bạn có quyền ghi;
- GitHub Actions được bật;
- Git nếu thao tác cục bộ;
- nhánh mới nếu nhánh mặc định yêu cầu pull request.

Đảm bảo terminal đang ở thư mục gốc repository:

```bash
git status
```

### Tạo action và workflow

Tạo hai thư mục:

```bash
mkdir -p .github/actions/greet .github/workflows
```

Sau đó:

1. Tạo `.github/actions/greet/action.yml` bằng nội dung ở phần [Một composite action có thể dùng ngay](#một-composite-action-có-thể-dùng-ngay).
2. Tạo `.github/workflows/test-local-action.yml` bằng nội dung ở phần [Workflow sử dụng action](#workflow-sử-dụng-action).
3. Kiểm tra Git nhận đúng hai file.

```bash
git status --short
git diff --check
```

`git diff --check` không in gì nghĩa là chưa phát hiện lỗi whitespace phổ biến.

Commit và push:

```bash
git add .github/actions/greet/action.yml \
  .github/workflows/test-local-action.yml
git commit -m "ci: add reusable greeting action"
git push -u origin "$(git branch --show-current)"
```

### Chạy và quan sát

Sự kiện `push` sẽ tạo workflow run vì commit thay đổi đúng hai path đã cấu hình.

1. Mở repository trên GitHub, chọn **Actions**.
2. Chọn workflow **Test local action**.
3. Mở run mới nhất và job **test-greet**.
4. Mở step **Gọi composite action**. Log phải có `Xin chào, Nhóm CI!`.
5. Mở step **Kiểm chứng output**. Log phải có `Output: Xin chào, Nhóm CI!` và step thành công.

Để kiểm tra giá trị mặc định, xóa cả khối `with` khỏi step gọi action rồi push lại. Run mới phải in `Xin chào, GitHub Actions!`. Sau đó khôi phục input nếu muốn giữ assertion ban đầu.

Khi file workflow đã có trên nhánh mặc định, bạn cũng có thể chọn **Run workflow** để chạy bằng `workflow_dispatch`.

### Tiêu chí kiểm chứng

| Tiêu chí | Cách xác nhận |
|---|---|
| Metadata hợp lệ | GitHub nạp workflow và không báo `action.yml` sai cú pháp |
| Local action được tìm thấy | Step **Gọi composite action** bắt đầu mà không báo thiếu metadata |
| Input đi vào action | Log có chính xác `Xin chào, Nhóm CI!` |
| Output được ánh xạ | Step sau in `Output: Xin chào, Nhóm CI!` |
| Assertion hoạt động | Job có kết luận **Success**; sửa expected value sẽ làm step cuối thất bại |
| Giá trị mặc định hoạt động | Khi bỏ `with`, action in `Xin chào, GitHub Actions!` |
| Quyền được giới hạn | Workflow khai báo `permissions: contents: read` |

## Best practices

- **Giữ action một trách nhiệm:** tên, input và output phải mô tả một tác vụ rõ ràng. Nếu action bắt đầu điều phối nhiều job, hãy chuyển sang reusable workflow.
- **Thiết kế hợp đồng ổn định:** input/output ID là API. Không đổi hoặc xóa trong cùng major version nếu chưa có giai đoạn deprecate.
- **Xác thực input trong action:** kiểm tra giá trị bắt buộc, enum, path và định dạng. Trả lỗi ngắn, có hướng xử lý.
- **Không chèn dữ liệu không tin cậy vào script:** chuyển expression qua `env`, quote biến shell và dùng action JavaScript khi parsing phức tạp.
- **Dùng `github.action_path` cho file đi kèm action:** workspace thuộc caller, còn script của action nằm trong thư mục action.
- **Khai báo shell trong composite action:** đừng phụ thuộc shell mặc định. Kiểm thử trên mọi hệ điều hành mà action tuyên bố hỗ trợ.
- **Bundle JavaScript action:** commit `dist/` cùng dependency đã bundle. Không giả định runtime sẽ chạy `npm install`.
- **Cố định môi trường Docker:** pin base image có chủ đích, chạy non-root khi có thể và giữ image nhỏ để giảm thời gian khởi động.
- **Pin dependency bằng full SHA:** thêm comment release cùng dòng và dùng Dependabot để tạo pull request cập nhật.
- **Giữ quyền token nhỏ nhất:** đặt `permissions` ở workflow, rồi chỉ nâng ở job cần thiết. Không truyền secret mà action không dùng.
- **Review mã setup và cleanup:** `pre`, `post`, entrypoint và action con đều có thể thực thi mã với quyền của job.
- **Viết README và test:** tài liệu hóa input, output, quyền, secret, hệ điều hành hỗ trợ và ví dụ `uses`. Test action bằng workflow riêng trước khi phát hành tag.
- **Bảo vệ thay đổi automation:** dùng pull request review và `CODEOWNERS` cho workflow cùng local action.
- **Đặt timeout ở job gọi:** action không sở hữu job nên caller phải giới hạn `timeout-minutes`.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Can't find action.yml, action.yaml or Dockerfile` | `uses` trỏ sai thư mục, trỏ thẳng vào file, hoặc local action chưa có trong workspace | Trỏ đến thư mục chứa metadata; với `./`, chạy checkout trước và kiểm tra `ls .github/actions/greet` |
| GitHub hỏi có quên chạy checkout không | Dùng local path `./` trước khi repository được checkout | Thêm `actions/checkout` trước action hoặc đổi sang `$/...` trên GitHub.com |
| `Unrecognized named-value: 'inputs'` | Dùng `inputs` context ở vị trí metadata không hỗ trợ hoặc YAML sai cấp | Đặt expression trong `runs.steps` của composite action và kiểm tra thụt lề |
| Bỏ input bắt buộc nhưng action vẫn chạy | `required: true` không tự làm action thất bại | Thêm validation trong JavaScript, entrypoint hoặc step đầu của composite action |
| Output rỗng | Step gọi action thiếu `id`, action không ghi `$GITHUB_OUTPUT`, hoặc composite output chưa có `value` | Kiểm tra đủ ba mắt xích: `id`, ghi output, ánh xạ `${{ steps.<id>.outputs.<name> }}` |
| `Permission denied` khi chạy script | File shell chưa có executable bit hoặc đường dẫn sai | Commit quyền bằng `git update-index --chmod=+x script.sh`; dùng `github.action_path` để tìm script |
| Docker action không chạy trên Windows/macOS | Docker container action chỉ hỗ trợ runner Linux | Chuyển job sang Linux hoặc viết JavaScript/composite action đa nền tảng |
| `Resource not accessible by integration` | `GITHUB_TOKEN` thiếu scope cần thiết | Đọc tài liệu action và chỉ thêm đúng quyền cần thiết tại job |
| Action bị organization policy chặn | Organization chỉ cho action trong allowlist hoặc bắt buộc pin full SHA | Dùng action được phê duyệt, pin full SHA thật và liên hệ quản trị viên nếu cần mở allowlist |
| `Unable to resolve action ...` | Sai owner/repository/path/ref, tag không tồn tại hoặc repository đã đổi tên | Mở repository gốc, kiểm tra ref và cú pháp; GitHub Actions không theo redirect khi action đổi tên |
| JavaScript action chạy local nhưng lỗi trên runner | `dist/` chưa được commit, dependency chưa bundle hoặc runtime không tương thích | Build lại artifact phát hành, commit `dist/` và kiểm tra `runs.using` cùng phiên bản runner |
| Giá trị input làm vỡ lệnh shell | Expression được chèn trực tiếp vào `run` hoặc biến không được quote | Truyền dữ liệu qua `env`, dùng `"$VARIABLE"` và validate dữ liệu không tin cậy |
| Local action dùng `$/` lỗi trên GHES | Self-repository reference `$/` chưa có trên GitHub Enterprise Server | Dùng checkout rồi gọi bằng đường dẫn `./` |

## Bước tiếp theo

<Cards>
  <Card title="Jobs và steps" href="/docs/nen-tang/04-jobs-va-steps/" description="Hiểu vị trí action trong job và thứ tự thực thi của các step." />
  <Card title="Runners" href="/docs/nen-tang/06-runners/" description="Tìm hiểu máy thực thi, workspace và khác biệt giữa GitHub-hosted với self-hosted runner." />
  <Card title="Contexts" href="/docs/nen-tang/07-contexts/" description="Đọc dữ liệu runtime bằng github, steps, inputs và các context khác." />
  <Card title="Workflow đầu tiên" href="/docs/bat-dau/03-workflow-dau-tien/" description="Ôn lại cách tạo workflow, đọc log và gọi action có sẵn." />
</Cards>

## Tài liệu tham khảo chính thức

- [About custom actions](https://docs.github.com/en/actions/sharing-automations/creating-actions/about-custom-actions)
- [Metadata syntax reference](https://docs.github.com/en/actions/sharing-automations/creating-actions/metadata-syntax-for-github-actions)
- [Using pre-written building blocks in your workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/find-and-customize-actions)
- [Creating a composite action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-composite-action)
- [Creating a JavaScript action](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action)
- [Creating a Docker container action](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-a-docker-container-action)
- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Reusing workflow configurations](https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Keeping your actions up to date with Dependabot](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/auto-update-actions)
