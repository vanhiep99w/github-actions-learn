---
title: "Composite actions"
description: "Đóng gói nhiều step thành một action có input, output, script đi kèm và phiên bản ổn định để tái sử dụng an toàn."
---

<Callout type="info" title="Bạn sẽ làm được gì?">
  Sau bài này, bạn có thể chọn đúng composite action, thiết kế `action.yml`, xử lý input/output an toàn, gọi action local hoặc remote và tự kiểm chứng một action hoàn chỉnh. Ví dụ dùng ref hiện hành tại thời điểm biên soạn và ghim action phụ thuộc bằng full commit SHA.
</Callout>

## Mục lục

- [Composite action là gì?](#composite-action-là-gì)
  - [Mô hình thực thi](#mô-hình-thực-thi)
  - [Chọn composite, reusable workflow hay JavaScript action](#chọn-composite-reusable-workflow-hay-javascript-action)
- [Cấu trúc một composite action](#cấu-trúc-một-composite-action)
  - [Thư mục đề xuất](#thư-mục-đề-xuất)
  - [Giải phẫu action.yml](#giải-phẫu-actionyml)
  - [Inputs và xác thực dữ liệu](#inputs-và-xác-thực-dữ-liệu)
  - [Steps và shell](#steps-và-shell)
  - [Outputs](#outputs)
- [Context, đường dẫn và biến môi trường](#context-đường-dẫn-và-biến-môi-trường)
  - [github.action_path khác GITHUB_WORKSPACE](#githubaction_path-khác-github_workspace)
  - [env và các file môi trường](#env-và-các-file-môi-trường)
- [Gọi và lồng action](#gọi-và-lồng-action)
  - [Gọi local action trong cùng repository](#gọi-local-action-trong-cùng-repository)
  - [Gọi remote action](#gọi-remote-action)
  - [Nested action steps](#nested-action-steps)
- [Ví dụ end-to-end](#ví-dụ-end-to-end)
  - [Mục tiêu và cấu trúc](#mục-tiêu-và-cấu-trúc)
  - [Script đi kèm action](#script-đi-kèm-action)
  - [action.yml hoàn chỉnh](#actionyml-hoàn-chỉnh)
  - [Caller workflow](#caller-workflow)
  - [Luồng thực thi](#luồng-thực-thi)
- [Bài thực hành và kiểm chứng](#bài-thực-hành-và-kiểm-chứng)
  - [Chạy thử](#chạy-thử)
  - [Kiểm tra ca lỗi và output](#kiểm-tra-ca-lỗi-và-output)
  - [Tiêu chí hoàn thành](#tiêu-chí-hoàn-thành)
- [Bảo mật input và script injection](#bảo-mật-input-và-script-injection)
  - [Mẫu nguy hiểm](#mẫu-nguy-hiểm)
  - [Mẫu an toàn](#mẫu-an-toàn)
- [Versioning và phát hành](#versioning-và-phát-hành)
  - [Action dùng nội bộ cùng repository](#action-dùng-nội-bộ-cùng-repository)
  - [Action phát hành từ repository riêng](#action-phát-hành-từ-repository-riêng)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Tài liệu chính thức](#tài-liệu-chính-thức)
- [Bài liên quan](#bài-liên-quan)

## Composite action là gì?

**Composite action** là một custom action gộp nhiều step `run` và `uses` thành một step duy nhất đối với workflow gọi nó. Custom action là đơn vị tự động hóa có metadata riêng và được gọi bằng `uses`.

Ví dụ, ba workflow đều cần cài runtime, kiểm tra input và tạo một giá trị chuẩn hóa. Thay vì sao chép ba step vào từng workflow, bạn đặt chúng trong một composite action:

```yaml
steps:
  - name: Chuẩn hóa tên bản phát hành
    id: release
    uses: ./.github/actions/safe-slug
    with:
      label: "Bản phát hành ổn định"
```

Caller — workflow gọi action — chỉ thấy một step. Bên trong step đó, GitHub chạy tuần tự mọi step được khai báo tại `runs.steps` trong `action.yml`.

Composite action không phải workflow thu nhỏ. Nó không có `on`, `jobs`, `runs-on`, `services`, `strategy`, `environment` hoặc `permissions`. Job của caller quyết định trigger, runner và quyền của `GITHUB_TOKEN`.

### Mô hình thực thi

```text
Caller workflow
└── Job: build (runs-on: ubuntu-latest)
    ├── Step: checkout
    ├── Step: gọi composite action
    │   ├── run step nội bộ
    │   ├── uses step nội bộ
    │   └── run step nội bộ → tạo output
    └── Step: đọc output của composite action
```

Mọi step nội bộ chạy trên cùng runner và trong cùng job với caller. Vì vậy, chúng nhìn thấy workspace, file môi trường và quyền token của job đó. Composite action không tạo máy ảo hoặc ranh giới bảo mật mới.

### Chọn composite, reusable workflow hay JavaScript action

| Nhu cầu | Composite action | Reusable workflow | JavaScript action |
|---|---|---|---|
| Đơn vị tái sử dụng | Một step gồm nhiều step nội bộ | Một workflow gồm một hoặc nhiều job | Một step chạy chương trình JavaScript |
| Nơi gọi | `jobs.<job_id>.steps[*].uses` | `jobs.<job_id>.uses` | `jobs.<job_id>.steps[*].uses` |
| Chọn runner riêng | Không | Có, từng job có `runs-on` | Không |
| Nhiều job, matrix, services hoặc environment | Không | Có | Không |
| Logic chính | Shell và action có sẵn | Điều phối pipeline | Parsing, API và xử lý lỗi phức tạp |
| Đóng gói dependency | Dùng công cụ có trên runner hoặc action con | Tùy từng job | Bundle mã và package vào `dist/` |
| Log | Caller chủ yếu thấy một step tổng | Từng job và step hiển thị riêng | Một step |

Dùng **composite action** khi cần biến một chuỗi step lặp lại thành API cấp step với `inputs` và `outputs`. Ví dụ điển hình là setup công cụ, chuẩn hóa metadata, lint hoặc kiểm tra chính sách cục bộ.

Dùng **reusable workflow** khi quy trình cần nhiều job, runner khác nhau, matrix, deployment environment, secrets interface hoặc quan hệ `needs`. Reusable workflow được gọi ở cấp job, không nằm trong `steps`.

Dùng **JavaScript action** khi shell bắt đầu chứa nhiều nhánh, parsing JSON/YAML, request API hoặc xử lý lỗi khó kiểm thử. JavaScript nhận dữ liệu như giá trị runtime thay vì tạo shell script từ expression, nên thường phù hợp hơn khi phải xử lý input phức tạp hoặc không tin cậy.

<Callout type="idea" title="Quy tắc chọn nhanh">
  Gói một chuỗi step thành một step: chọn composite action. Gói cả một giai đoạn CI/CD gồm nhiều job: chọn reusable workflow. Viết một chương trình có logic đáng kể: chọn JavaScript action.
</Callout>

## Cấu trúc một composite action

GitHub nhận diện action qua file metadata tên `action.yml` hoặc `action.yaml`. GitHub khuyến nghị `action.yml`. File phải nằm ngay trong thư mục mà giá trị `uses` trỏ đến.

### Thư mục đề xuất

Với action chỉ dùng trong một repository, đặt mỗi action trong một thư mục con của `.github/actions/`:

```text
repository/
├── .github/
│   ├── actions/
│   │   └── safe-slug/
│   │       ├── action.yml
│   │       └── scripts/
│   │           └── create-slug.mjs
│   └── workflows/
│       └── test-safe-slug.yml
└── ...
```

Cách bố trí này tách metadata và script của action khỏi workflow. Nếu phát hành action cho nhiều repository hoặc công khai trên Marketplace, repository riêng thường dễ quản lý release, issue và quyền review hơn.

### Giải phẫu action.yml

Khung tối thiểu của composite action là:

```yaml
name: "Tên action"
description: "Mô tả ngắn về công việc action thực hiện"

runs:
  using: composite
  steps:
    - name: Một step nội bộ
      shell: bash
      run: echo "Hello from a composite action"
```

Các khóa quan trọng:

| Khóa | Bắt buộc | Vai trò |
|---|---|---|
| `name` | Có | Tên hiển thị của action |
| `description` | Có | Mô tả ngắn về trách nhiệm của action |
| `inputs` | Không | Hợp đồng dữ liệu caller truyền qua `with` |
| `outputs` | Không | Hợp đồng dữ liệu caller đọc qua context `steps` |
| `runs` | Có | Cách GitHub thực thi action |
| `runs.using: composite` | Có | Xác định đây là composite action |
| `runs.steps` | Có | Danh sách `run` step hoặc `uses` step nội bộ |
| `branding` | Không | Icon và màu khi action được niêm yết trên Marketplace |

`action.yml` không có `on:` vì action không tự chọn sự kiện. Nó cũng không có `permissions:` vì quyền thuộc về workflow hoặc job gọi action.

### Inputs và xác thực dữ liệu

Input được khai báo dưới `inputs.<input_id>`:

```yaml
inputs:
  label:
    description: "Nhãn cần chuẩn hóa"
    required: true
  prefix:
    description: "Tiền tố của kết quả"
    required: false
    default: "preview"
```

Caller truyền giá trị bằng `with`:

```yaml
with:
  label: "Release Candidate 1"
  prefix: "rc"
```

Trong composite action, đọc input qua `${{ inputs.label }}`. GitHub **không tự tạo** biến `INPUT_LABEL` cho composite action. Nếu muốn dùng biến đó trong script, bạn phải ánh xạ rõ ràng qua `env`:

```yaml
- name: Kiểm tra input
  shell: bash
  env:
    INPUT_LABEL: ${{ inputs.label }}
  run: test -n "$INPUT_LABEL"
```

`required: true` chỉ mô tả hợp đồng. GitHub không tự làm action thất bại khi caller bỏ trống input bắt buộc. Step đầu tiên hoặc chương trình của action vẫn phải kiểm tra chuỗi rỗng, enum, độ dài, đường dẫn và định dạng được phép.

### Steps và shell

`runs.steps` hỗ trợ hai dạng chính:

```yaml
runs:
  using: composite
  steps:
    - name: Chạy lệnh shell
      shell: bash
      run: |
        printf 'Runner: %s\n' "$RUNNER_OS"

    - name: Gọi một action khác
      uses: OWNER/REPOSITORY@REF
      with:
        example-input: "value"
```

Mỗi step có `run` phải khai báo `shell`. Không nên dựa vào shell mặc định của caller vì metadata composite yêu cầu lựa chọn rõ ràng và action có thể được gọi từ nhiều workflow khác nhau.

Các shell thông dụng gồm `bash`, `sh`, `pwsh` và `python`. Shell hoặc executable đó phải có trên runner. Nếu muốn hỗ trợ nhiều hệ điều hành, tách step bằng điều kiện:

```yaml
runs:
  using: composite
  steps:
    - name: Kiểm tra trên Linux và macOS
      if: runner.os != 'Windows'
      shell: bash
      run: ./scripts/check.sh

    - name: Kiểm tra trên Windows
      if: runner.os == 'Windows'
      shell: pwsh
      run: ./scripts/check.ps1
```

Đường dẫn `./scripts/check.sh` trong ví dụ trên phụ thuộc working directory hiện tại nên chưa đủ bền vững. Phần tiếp theo trình bày cách gọi script đi kèm action bằng `github.action_path`.

### Outputs

Composite action ánh xạ output của một step nội bộ thành output công khai:

```yaml
outputs:
  slug:
    description: "Nhãn đã được chuẩn hóa"
    value: ${{ steps.build.outputs.slug }}

runs:
  using: composite
  steps:
    - name: Tạo output
      id: build
      shell: bash
      run: printf 'slug=%s\n' "preview-demo" >> "$GITHUB_OUTPUT"
```

Ba mắt xích đều cần thiết:

1. Step nội bộ có `id`, ở đây là `build`.
2. Step ghi `name=value` vào file `$GITHUB_OUTPUT`.
3. `outputs.<output_id>.value` ánh xạ `${{ steps.<id>.outputs.<name> }}`.

Caller cũng phải đặt `id` cho step gọi action trước khi đọc output:

```yaml
- name: Tạo slug
  id: slugger
  uses: ./.github/actions/safe-slug
  with:
    label: "Demo"

- name: Đọc output
  env:
    SLUG: ${{ steps.slugger.outputs.slug }}
  run: printf '%s\n' "$SLUG"
```

Output phù hợp với chuỗi metadata nhỏ. Dùng artifact thay vì output cho file, binary, báo cáo lớn hoặc dữ liệu cần tải xuống sau workflow run.

## Context, đường dẫn và biến môi trường

Composite action chia sẻ runner với caller nhưng có hai vị trí file khác nhau: thư mục chứa action và workspace của repository đang được xử lý. Nhầm hai vị trí này là nguyên nhân phổ biến khiến action local chạy được nhưng action remote thất bại.

### github.action_path khác GITHUB_WORKSPACE

- `${{ github.action_path }}` là thư mục chứa action đang chạy. Dùng nó để tìm script, template hoặc file cấu hình được đóng gói cùng action.
- `$GITHUB_WORKSPACE` là workspace của repository mà job đang xử lý. Dùng nó để đọc mã nguồn của caller sau checkout.

Ví dụ bền vững để chạy script đi kèm action:

```yaml
- name: Chạy script của action
  shell: bash
  env:
    ACTION_SCRIPT: ${{ github.action_path }}/scripts/check.sh
  run: bash "$ACTION_SCRIPT"
```

Hoặc dùng biến mặc định tương ứng trong composite action:

```yaml
- name: Chạy script của action
  shell: bash
  run: bash "$GITHUB_ACTION_PATH/scripts/check.sh"
```

Không ghép `$GITHUB_WORKSPACE/scripts/check.sh` nếu `check.sh` thuộc action. Khi action được tải từ repository khác, mã action không nằm trong workspace của caller.

<Callout type="warn" title="Đừng dùng cd như trạng thái dùng chung">
  Mỗi `run` step khởi động một process shell riêng. Lệnh `cd` ở step trước không đổi working directory của step sau. Hãy dùng `working-directory` cho từng step hoặc dùng đường dẫn tuyệt đối lấy từ `github.action_path` và `GITHUB_WORKSPACE`.
</Callout>

### env và các file môi trường

`env` trên một step chỉ tồn tại trong step đó:

```yaml
- name: Dùng input an toàn
  shell: bash
  env:
    LABEL: ${{ inputs.label }}
  run: |
    printf 'Label: %s\n' "$LABEL"
```

Muốn biến có hiệu lực cho các step tiếp theo trong cùng job, ghi vào `$GITHUB_ENV`:

```yaml
- name: Công bố biến cho step sau
  shell: bash
  run: printf 'SAFE_SLUG_MODE=%s\n' "strict" >> "$GITHUB_ENV"
```

Muốn bổ sung thư mục vào `PATH`, ghi vào `$GITHUB_PATH`. Muốn tạo output, ghi vào `$GITHUB_OUTPUT`. Các file môi trường này ảnh hưởng đến job của caller, không chỉ phần hiển thị bên trong composite action. Vì vậy, hãy dùng tên biến có prefix riêng để tránh ghi đè biến của caller.

Không đặt secret hoặc dữ liệu không tin cậy vào output nếu không cần. Với dữ liệu nhiều dòng, dùng cú pháp delimiter của file môi trường và bảo đảm delimiter không thể xuất hiện trong dữ liệu. Với dữ liệu tùy ý hoặc kích thước lớn, ghi vào file rồi dùng artifact.

## Gọi và lồng action

Một composite action có thể được dùng từ cùng repository, repository khác hoặc một thư mục con trong repository phát hành. Nó cũng có thể gọi action khác trong `runs.steps`.

### Gọi local action trong cùng repository

Cách tương thích rộng là checkout repository rồi dùng đường dẫn bắt đầu bằng `./`:

```yaml
steps:
  - name: Checkout repository
    uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

  - name: Gọi local composite action
    uses: ./.github/actions/safe-slug
    with:
      label: "Demo"
```

`./.github/actions/safe-slug` được tính từ `$GITHUB_WORKSPACE`. Vì vậy, checkout phải chạy trước. `uses` trỏ đến **thư mục chứa `action.yml`**, không trỏ thẳng đến file:

```yaml
# Sai
uses: ./.github/actions/safe-slug/action.yml
```

Trên GitHub.com, self-repository reference `$/` trỏ đến action trong cùng repository và đúng commit của workflow run:

```yaml
steps:
  - name: Gọi action cùng repository tại commit đang chạy
    uses: $/.github/actions/safe-slug
```

Cú pháp `$/` không cần checkout trước, không có hậu tố `@ref` và chưa được hỗ trợ trên GitHub Enterprise Server. Nếu cần tương thích GHES, dùng checkout rồi gọi bằng `./`.

### Gọi remote action

Action ở root của repository dùng cú pháp:

```yaml
uses: OWNER/REPOSITORY@REF
```

Action ở thư mục con dùng cú pháp:

```yaml
uses: OWNER/REPOSITORY/path/to/action@REF
```

Ví dụ một phiên bản đã phát hành:

```yaml
- name: Tạo slug bằng remote action
  id: slugger
  uses: acme/automation/.github/actions/safe-slug@v1.2.0
  with:
    label: "Release Candidate"
```

`REF` có thể là tag, branch hoặc full commit SHA. Full SHA là lựa chọn bất biến và an toàn nhất cho production. Với private repository, caller phải có quyền đọc và repository phát hành phải cho phép repository hoặc organization đích truy cập action.

### Nested action steps

Một step trong `runs.steps` có thể dùng `uses` để gọi JavaScript action, Docker action hoặc composite action khác. Đây được gọi là **nested action step**, tức action lồng action:

```yaml
runs:
  using: composite
  steps:
    - name: Cài Node.js
      uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version: "24"

    - name: Chạy kiểm tra
      shell: bash
      run: node "$GITHUB_ACTION_PATH/scripts/check.mjs"
```

Action con chạy với cùng workspace, token và quyền của job. Hãy review và ghim phiên bản của mọi action con giống như dependency được gọi trực tiếp từ workflow.

Để gọi action khác nằm trong **cùng repository với composite action**, ưu tiên self-repository reference:

```yaml
- name: Gọi action anh em
  uses: $/.github/actions/shared-validator
```

Self-reference `$/` giải quyết repository tại commit đang chạy mà không cần `@ref`. Ngược lại, `./` luôn là local path trong workspace của caller. Khi composite action được gọi từ repository khác, `./another-action` không tự trỏ đến thư mục bên cạnh composite action.

Không xây ref động như `uses: OWNER/REPOSITORY@${{ inputs.version }}`. Giá trị `uses` phải là tham chiếu tĩnh để dependency có thể được phân tích và kiểm soát. Nếu cần thay đổi hành vi, dùng input được xác thực hoặc tách thành các phiên bản action rõ ràng.

## Ví dụ end-to-end

Ví dụ này tạo action `safe-slug`. Action nhận một nhãn như `Bản phát hành an toàn`, chuẩn hóa thành `preview-ban-phat-hanh-an-toan`, rồi công bố kết quả qua output `slug`.

Action minh họa đủ các phần quan trọng:

- input bắt buộc và input có giá trị mặc định;
- nested action step được ghim bằng full SHA;
- script đi kèm được tìm bằng `github.action_path`;
- expression được chuyển qua `env` thay vì chèn vào code;
- validation và output qua `$GITHUB_OUTPUT`;
- caller workflow có quyền tối thiểu và assertion tự động.

### Mục tiêu và cấu trúc

Tạo các file sau trong repository thực hành:

```text
.github/
├── actions/
│   └── safe-slug/
│       ├── action.yml
│       └── scripts/
│           └── create-slug.mjs
└── workflows/
    └── test-safe-slug.yml
```

### Script đi kèm action

Tạo `.github/actions/safe-slug/scripts/create-slug.mjs`:

```js
import { appendFileSync } from "node:fs";

const label = process.env.INPUT_LABEL ?? "";
const prefix = process.env.INPUT_PREFIX ?? "preview";
const outputFile = process.env.GITHUB_OUTPUT;

if (!outputFile) {
  console.error("::error::Không tìm thấy GITHUB_OUTPUT.");
  process.exit(1);
}

if (!label.trim()) {
  console.error("::error::Input 'label' không được rỗng.");
  process.exit(1);
}

if (label.length > 100) {
  console.error("::error::Input 'label' không được dài quá 100 ký tự.");
  process.exit(1);
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prefix)) {
  console.error(
    "::error::Input 'prefix' chỉ được chứa chữ thường, số và dấu gạch nối.",
  );
  process.exit(1);
}

const normalizedLabel = label
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[đĐ]/g, "d")
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

if (!normalizedLabel) {
  console.error("::error::Input 'label' không tạo được slug hợp lệ.");
  process.exit(1);
}

const slug = `${prefix}-${normalizedLabel}`;
appendFileSync(outputFile, `slug=${slug}\n`, "utf8");
console.log(`Đã tạo slug: ${slug}`);
```

Script đọc input từ biến môi trường. Nội dung input không bao giờ trở thành mã JavaScript hoặc shell. Kết quả chỉ gồm chữ thường, số và dấu gạch nối, nên có thể ghi an toàn dưới dạng output một dòng.

Không cần đặt executable bit cho file này vì action gọi `node <đường-dẫn-script>` thay vì thực thi file trực tiếp.

### action.yml hoàn chỉnh

Tạo `.github/actions/safe-slug/action.yml`:

```yaml
name: "Safe slug"
description: "Chuẩn hóa một nhãn thành slug một dòng an toàn"
author: "Platform Team"

inputs:
  label:
    description: "Nhãn cần chuẩn hóa"
    required: true
  prefix:
    description: "Tiền tố đứng trước slug"
    required: false
    default: "preview"

outputs:
  slug:
    description: "Slug đã chuẩn hóa"
    value: ${{ steps.create.outputs.slug }}

runs:
  using: composite
  steps:
    - name: Cài Node.js
      uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version: "24"

    - name: Tạo slug
      id: create
      shell: bash
      env:
        INPUT_LABEL: ${{ inputs.label }}
        INPUT_PREFIX: ${{ inputs.prefix }}
        ACTION_SCRIPT: ${{ github.action_path }}/scripts/create-slug.mjs
      run: node "$ACTION_SCRIPT"
```

Step `create` có `id` để `outputs.slug.value` đọc được `${{ steps.create.outputs.slug }}`. `ACTION_SCRIPT` trỏ đến file được đóng gói với action, nên action vẫn chạy đúng khi được gọi từ repository khác.

Action con `actions/setup-node` được ghim vào full commit SHA tương ứng release `v7.0.0`. Comment giữ thông tin phiên bản cho người review và công cụ cập nhật dependency.

### Caller workflow

Tạo `.github/workflows/test-safe-slug.yml`:

```yaml
name: Test safe slug

on:
  push:
    paths:
      - ".github/actions/safe-slug/**"
      - ".github/workflows/test-safe-slug.yml"
  workflow_dispatch:
    inputs:
      label:
        description: "Nhãn dùng để tạo slug"
        required: false
        default: "Bản phát hành an toàn"
        type: string

permissions:
  contents: read

jobs:
  test-safe-slug:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Gọi local composite action
        id: slugger
        uses: ./.github/actions/safe-slug
        with:
          label: ${{ inputs.label || 'Bản phát hành an toàn' }}
          prefix: "preview"

      - name: Kiểm chứng output
        shell: bash
        env:
          SLUG: ${{ steps.slugger.outputs.slug }}
        run: |
          if [[ ! "$SLUG" =~ ^preview-[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
            printf 'Output không hợp lệ: %s\n' "$SLUG" >&2
            exit 1
          fi

          printf 'Output hợp lệ: %s\n' "$SLUG"
```

Workflow chỉ cần quyền `contents: read` để checkout source. Không có quyền ghi và không truyền secret cho action. `timeout-minutes` giới hạn thời gian nếu action hoặc dependency bị treo.

`actions/checkout` được ghim vào full commit SHA tương ứng `v7.0.1`. Khi sao chép bài này ở thời điểm khác, hãy kiểm tra release chính thức và nâng SHA qua pull request có review.

### Luồng thực thi

```text
push hoặc workflow_dispatch
        │
        ▼
checkout repository
        │
        ▼
gọi ./.github/actions/safe-slug
        │
        ├── setup-node chuẩn bị Node.js 24
        │
        └── create-slug.mjs xác thực và ghi slug vào GITHUB_OUTPUT
                                      │
                                      ▼
                    outputs.slug ánh xạ step output
                                      │
                                      ▼
caller kiểm tra định dạng và kết thúc thành công
```

Với input mặc định, log cuối phải chứa:

```text
Output hợp lệ: preview-ban-phat-hanh-an-toan
```

## Bài thực hành và kiểm chứng

Bài thực hành dùng ba file ở phần end-to-end. Bạn chỉ cần một repository đã bật GitHub Actions và quyền tạo branch.

### Chạy thử

Từ thư mục gốc repository, tạo cấu trúc thư mục:

```bash
mkdir -p .github/actions/safe-slug/scripts .github/workflows
```

Sao chép đúng nội dung của ba file rồi kiểm tra thay đổi:

```bash
git status --short
git diff --check
```

Commit và push lên branch thực hành:

```bash
git add .github/actions/safe-slug/action.yml \
  .github/actions/safe-slug/scripts/create-slug.mjs \
  .github/workflows/test-safe-slug.yml
git commit -m "ci: add safe slug composite action"
git push -u origin "$(git branch --show-current)"
```

Sự kiện `push` chạy workflow vì commit thay đổi đúng các path đã cấu hình. Bạn cũng có thể mở **Actions → Test safe slug → Run workflow** và nhập nhãn khác.

### Kiểm tra ca lỗi và output

Thực hiện lần lượt ba kiểm tra:

1. **Giá trị mặc định:** chạy `workflow_dispatch` mà không đổi input. Step cuối phải in `preview-ban-phat-hanh-an-toan`.
2. **Giá trị tùy chỉnh:** nhập `Release Candidate 2`. Step cuối phải in `preview-release-candidate-2`.
3. **Validation:** tạm đổi `prefix` trong caller thành `PREVIEW;exit 0`. Step **Tạo slug** phải thất bại với annotation giải thích định dạng prefix. Sau đó khôi phục `preview`.

Ca thứ ba chứng minh action không thực thi input như lệnh. Nó từ chối dữ liệu không đúng hợp đồng trước khi tạo output.

Để kiểm tra output mapping, tạm đổi `${{ steps.create.outputs.slug }}` trong `action.yml` thành một `id` không tồn tại. Workflow phải đi đến step assertion với output rỗng và thất bại. Khôi phục `steps.create` sau khi quan sát lỗi.

### Tiêu chí hoàn thành

| Tiêu chí | Cách xác nhận |
|---|---|
| Metadata hợp lệ | GitHub nạp action mà không báo lỗi `action.yml` |
| Local path đúng | Step gọi action không báo thiếu `action.yml` hoặc `action.yaml` |
| Nested action chạy | Log có step cài Node.js 24 |
| Script được tìm đúng chỗ | Không có lỗi `MODULE_NOT_FOUND`; log có `Đã tạo slug` |
| Input được xác thực | Prefix không hợp lệ làm step thất bại với annotation rõ ràng |
| Output được ánh xạ | Caller đọc được `steps.slugger.outputs.slug` |
| Assertion hoạt động | Output sai định dạng làm job thất bại |
| Quyền tối thiểu | Workflow chỉ khai báo `permissions: contents: read` |
| Dependency bất biến | `checkout` và `setup-node` đều dùng full commit SHA |

## Bảo mật input và script injection

Input của action có thể đến từ `workflow_dispatch`, pull request title, branch name, issue body, API response hoặc output của action khác. Hãy xem mọi dữ liệu mà người không đáng tin cậy có thể sửa là **untrusted input** — dữ liệu chưa được tin cậy.

Composite action chạy cùng quyền với caller. Một lỗ hổng injection trong action có thể đọc source, dùng `github.token`, truy cập secret được caller truyền hoặc thay đổi file trước bước publish.

### Mẫu nguy hiểm

Không chèn expression trực tiếp vào `run`:

```yaml
- name: Không an toàn
  shell: bash
  run: echo "${{ inputs.label }}" | tr '[:upper:]' '[:lower:]'
```

GitHub thay expression trước khi tạo shell script tạm. Nếu input chứa dấu nháy và câu lệnh shell, nội dung đó có thể phá cấu trúc script và chạy lệnh ngoài ý muốn.

Cũng tránh các API nhận chuỗi rồi thực thi như code:

```bash
# Không dùng dữ liệu không tin cậy với eval
command_from_input="$INPUT_COMMAND"
eval "$command_from_input"
```

Một input kiểu `command` hoặc `extra-args` tự do thường biến action thành cổng thực thi tùy ý. Nếu thật sự cần tùy chọn, hãy thiết kế enum như `mode: lint | test | build` và ánh xạ từng giá trị sang lệnh cố định.

### Mẫu an toàn

Chuyển expression qua biến môi trường, quote biến và xác thực trước khi dùng:

```yaml
- name: An toàn hơn
  shell: bash
  env:
    LABEL: ${{ inputs.label }}
  run: |
    if [[ -z "$LABEL" || ${#LABEL} -gt 100 ]]; then
      echo "::error::Input 'label' không hợp lệ."
      exit 1
    fi

    printf '%s\n' "$LABEL" | tr '[:upper:]' '[:lower:]'
```

Cách này giữ dữ liệu ngoài giai đoạn sinh shell script. Dấu nháy `"$LABEL"` ngăn word splitting và glob expansion. Validation giới hạn hình dạng dữ liệu trước khi nó đi vào lệnh tiếp theo.

Áp dụng thêm các lớp bảo vệ sau:

- Dùng allowlist cho enum, tên môi trường, tên package và cờ command-line.
- Với path, chuẩn hóa rồi bảo đảm kết quả vẫn nằm dưới thư mục được phép. Từ chối `..`, path tuyệt đối và symbolic link ngoài ý muốn khi phù hợp.
- Không ghi input thô nhiều dòng trực tiếp vào `$GITHUB_OUTPUT`, `$GITHUB_ENV` hoặc `$GITHUB_PATH`. Chuẩn hóa thành một dòng, dùng delimiter an toàn hoặc ghi dữ liệu vào file.
- Không in secret hoặc toàn bộ context `github` vào log. `github.token` có thể xuất hiện trong context.
- Caller phải đặt `permissions` tối thiểu. Composite action không thể tự hạ quyền token của job.
- Pin mọi remote action và nested action bằng full SHA, rồi review thay đổi khi nâng phiên bản.
- Không dùng `pull_request_target` để checkout và chạy mã không tin cậy trong job có secret hoặc quyền ghi.

<Callout type="warn" title="env không tự biến dữ liệu thành an toàn">
  Chuyển expression qua `env` chỉ ngăn dữ liệu tham gia quá trình tạo script. Bạn vẫn phải quote biến, không dùng `eval`, xác thực định dạng và kiểm soát chương trình nhận dữ liệu đó.
</Callout>

## Versioning và phát hành

Inputs, outputs và hành vi của action là một API. Người dùng sẽ phụ thuộc vào tên input, giá trị mặc định, định dạng output, hệ điều hành hỗ trợ và side effect của action.

### Action dùng nội bộ cùng repository

Với `./.github/actions/name`, action đến từ nội dung đã checkout vào workspace. Nó thường được version cùng ứng dụng và thay đổi qua cùng pull request:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
- uses: ./.github/actions/safe-slug
```

Với `$/`, GitHub lấy action cùng repository tại commit đang chạy mà không cần checkout:

```yaml
- uses: $/.github/actions/safe-slug
```

Dù không phát hành tag riêng, bạn vẫn nên:

- bảo vệ `.github/actions/**` và `.github/workflows/**` bằng `CODEOWNERS`;
- có workflow test action khi metadata hoặc script thay đổi;
- thông báo deprecation trước khi xóa input/output;
- cập nhật mọi caller trong cùng pull request khi có breaking change.

### Action phát hành từ repository riêng

Dùng Semantic Versioning cho release:

- `v1.2.3`: patch cụ thể, dễ truy vết;
- `v1`: major tag thuận tiện, có thể di chuyển đến patch tương thích mới nhất;
- full commit SHA: bất biến và an toàn nhất cho consumer;
- branch như `main`: thay đổi liên tục, không nên dùng trong production.

Quy trình phát hành đề xuất:

1. Test action trên các runner được tuyên bố hỗ trợ.
2. Review dependency, script và quyền cần thiết.
3. Tạo release tag cụ thể, ví dụ `v1.2.3`.
4. Nếu không dùng immutable release, cập nhật major tag `v1` đến cùng commit.
5. Công bố release notes, input/output và migration guide nếu có breaking change.
6. Hướng dẫn consumer pin full SHA tương ứng release.

Consumer production nên dùng:

```yaml
- uses: OWNER/REPOSITORY@FULL_COMMIT_SHA # v1.2.3
```

Tác giả có thể dùng `v1` trong tài liệu để ví dụ ngắn hơn, nhưng phải giải thích trade-off: major tag nhận bản sửa tương thích thuận tiện hơn nhưng tag có thể bị di chuyển. Full SHA không tự nhận bản vá, nên kết hợp Dependabot hoặc quy trình cập nhật định kỳ.

Tăng **major version** khi xóa/đổi tên input hoặc output, đổi giá trị mặc định gây thay đổi hành vi, bỏ hệ điều hành đang hỗ trợ hoặc thay đổi side effect. Thêm input tùy chọn tương thích hoặc sửa lỗi không phá hợp đồng thường có thể là minor/patch tùy phạm vi.

## Best practices

- **Giữ một trách nhiệm rõ ràng.** Action nên có tên và output mô tả một tác vụ. Khi nó bắt đầu điều phối nhiều job, chuyển sang reusable workflow.
- **Thiết kế interface nhỏ.** Chỉ công bố input/output caller thật sự cần. Quá nhiều cờ boolean thường là dấu hiệu action đang làm nhiều việc không liên quan.
- **Tự validation input bắt buộc.** `required: true` không tự tạo lỗi khi giá trị trống.
- **Không nhận command tùy ý.** Dùng enum và ánh xạ sang lệnh cố định thay cho `eval` hoặc input `script`.
- **Đưa expression qua `env`.** Quote mọi biến shell và dùng JavaScript action khi parsing trở nên phức tạp.
- **Dùng `github.action_path`.** Tìm script/template đi kèm action bằng đường dẫn action, không bằng workspace của caller.
- **Khai báo shell ở mọi `run` step.** Test trên Linux, Windows và macOS nếu action tuyên bố đa nền tảng.
- **Dùng prefix cho biến môi trường.** Ghi vào `GITHUB_ENV` hoặc `GITHUB_PATH` có thể ảnh hưởng step phía sau của caller.
- **Ánh xạ output rõ ràng.** Đặt `id` ổn định cho step tạo output và dùng `$GITHUB_OUTPUT`, không dùng cú pháp `::set-output` cũ.
- **Pin dependency bằng full SHA.** Bao gồm cả action lồng bên trong composite action. Ghi release tag trong comment để review dễ hơn.
- **Giữ quyền ở caller nhỏ nhất.** Action không sở hữu `permissions`; workflow hoặc job gọi action phải cấp đúng scope cần thiết.
- **Không log dữ liệu nhạy cảm.** Tài liệu hóa secret/quyền cần thiết và chỉ yêu cầu caller truyền đúng giá trị action cần.
- **Đặt timeout ở job gọi.** Composite action không thể tự đặt `timeout-minutes` cho job.
- **Viết test consumer.** Test input mặc định, input biên, output, path, shell và lỗi dependency trước khi phát hành.
- **Duy trì API theo SemVer.** Deprecate trước khi xóa và dành breaking change cho major release.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Can't find action.yml, action.yaml or Dockerfile` | `uses` trỏ sai thư mục, trỏ thẳng vào file hoặc repository chưa được checkout | Trỏ đến thư mục chứa metadata; với `./`, chạy checkout trước |
| GitHub gợi ý “Did you forget to run actions/checkout” | Local action chưa có trong `$GITHUB_WORKSPACE` | Thêm checkout trước `./...` hoặc dùng `$/...` trên GitHub.com |
| `Required property is missing: shell` | Step nội bộ có `run` nhưng thiếu `shell` | Thêm `shell: bash`, `pwsh` hoặc shell phù hợp cho từng run step |
| `Unrecognized named-value: 'inputs'` | Expression đặt sai cấp hoặc file không được nhận diện là composite action | Kiểm tra `runs.using: composite`, thụt lề và chỉ dùng context ở khóa được hỗ trợ |
| Input có `required: true` nhưng action vẫn chạy khi bỏ trống | GitHub không tự xác thực input action | Thêm validation ở step đầu hoặc chương trình của action |
| Script đi kèm báo `No such file` hoặc `MODULE_NOT_FOUND` | Action dùng path tương đối từ workspace của caller | Dùng `${{ github.action_path }}` hoặc `$GITHUB_ACTION_PATH` |
| `Permission denied` khi chạy `.sh` | File thiếu executable bit | Gọi `bash "$GITHUB_ACTION_PATH/script.sh"` hoặc commit quyền bằng `git update-index --chmod=+x` |
| Output rỗng | Thiếu `id`, ghi sai `$GITHUB_OUTPUT`, sai tên hoặc thiếu `outputs.<id>.value` | Kiểm tra đủ ba mắt xích từ step nội bộ đến metadata rồi đến caller |
| Step sau không thấy biến môi trường | `env` chỉ được đặt cho một step | Ghi `NAME=value` vào `$GITHUB_ENV` nếu thật sự cần truyền sang step sau |
| `./another-action` gọi nhầm action | `./` được giải quyết từ workspace của caller, không phải thư mục composite action | Dùng `$/path` cho action cùng repository hoặc tham chiếu remote có ref |
| Action lồng bị organization policy chặn | Dependency không thuộc allowlist hoặc chưa pin SHA | Dùng action được phê duyệt và full commit SHA hợp lệ |
| `Resource not accessible by integration` | `GITHUB_TOKEN` của caller thiếu quyền | Khai báo đúng quyền tối thiểu tại job; không dùng `write-all` |
| Action chỉ lỗi trên Windows | Script hoặc shell phụ thuộc Bash/path kiểu POSIX | Thêm nhánh `runner.os`, dùng `pwsh` hoặc giới hạn rõ runner hỗ trợ |
| Input làm vỡ câu lệnh hoặc chạy lệnh ngoài ý muốn | Expression được chèn thẳng vào `run`, biến không quote hoặc có `eval` | Chuyển qua `env`, quote biến, dùng allowlist và bỏ `eval` |
| Self-reference `$/` lỗi trên GHES | GitHub Enterprise Server chưa hỗ trợ cú pháp này | Checkout repository rồi dùng local path `./` |
| Remote action không tải được | Sai owner/repository/path/ref hoặc repository private chưa cấp quyền | Kiểm tra ref tồn tại và cấu hình Actions access của repository phát hành |

## Tài liệu chính thức

- [Creating a composite action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-composite-action)
- [Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runs-for-composite-actions)
- [Reusing workflow configurations](https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations)
- [Managing custom actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)
- [Contexts reference — github.action_path](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context)
- [Workflow commands — environment files và outputs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Workflow syntax — steps.uses](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses)

## Bài liên quan

<Cards>
  <Card title="Reusable workflows" href="/docs/tai-su-dung-actions/01-reusable-workflows/" description="Tái sử dụng cả pipeline gồm nhiều job và runner." />
  <Card title="JavaScript actions" href="/docs/tai-su-dung-actions/04-javascript-actions/" description="Chuyển logic phức tạp khỏi shell sang một chương trình được bundle." />
  <Card title="Action metadata" href="/docs/tai-su-dung-actions/06-action-metadata/" description="Tra cứu sâu inputs, outputs, runs và branding trong action.yml." />
  <Card title="Phát hành và version actions" href="/docs/tai-su-dung-actions/07-publish-version-actions/" description="Quản lý tag, release và cập nhật action an toàn." />
</Cards>
