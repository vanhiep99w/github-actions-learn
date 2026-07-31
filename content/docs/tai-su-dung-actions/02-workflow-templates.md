---
title: "Workflow templates cho organization"
description: "Tạo, phân phối và quản trị workflow template từ repository .github để các repository trong organization khởi tạo GitHub Actions nhất quán nhưng vẫn tùy biến được."
---

<Callout type="info" title="Bạn sẽ làm được gì?">
  Sau bài này, bạn có thể xuất bản một workflow template trong repository `.github` của organization, mô tả template bằng file `.properties.json`, kiểm soát nơi template xuất hiện bằng `filePatterns` và dùng đúng biến thay thế `$default-branch`. Bạn cũng sẽ biết cách kết hợp template với reusable workflow, quản trị phiên bản và xử lý các lỗi khiến template không xuất hiện trong giao diện Actions.
</Callout>

## Mục lục

- [Workflow template là gì?](#workflow-template-là-gì)
  - [Luồng từ organization đến repository sử dụng](#luồng-từ-organization-đến-repository-sử-dụng)
  - [Starter workflow và workflow template](#starter-workflow-và-workflow-template)
- [Điều kiện phân phối](#điều-kiện-phân-phối)
  - [Repository đặc biệt của organization](#repository-đặc-biệt-của-organization)
  - [Phạm vi theo visibility](#phạm-vi-theo-visibility)
- [Cấu trúc thư mục và quy tắc đặt tên](#cấu-trúc-thư-mục-và-quy-tắc-đặt-tên)
- [File workflow mẫu](#file-workflow-mẫu)
  - [Biến thay thế được hỗ trợ](#biến-thay-thế-được-hỗ-trợ)
  - [Expression không phải biến thay thế](#expression-không-phải-biến-thay-thế)
- [File metadata properties.json](#file-metadata-propertiesjson)
  - [Các thuộc tính metadata](#các-thuộc-tính-metadata)
  - [Logo SVG và Octicon](#logo-svg-và-octicon)
  - [Lọc repository bằng filePatterns](#lọc-repository-bằng-filepatterns)
- [Template xuất hiện trong giao diện Actions](#template-xuất-hiện-trong-giao-diện-actions)
  - [Phía người duy trì template](#phía-người-duy-trì-template)
  - [Phía repository sử dụng](#phía-repository-sử-dụng)
- [Thiết kế dùng chung nhưng vẫn tùy biến](#thiết-kế-dùng-chung-nhưng-vẫn-tùy-biến)
  - [Chọn mức độ chuẩn hóa](#chọn-mức-độ-chuẩn-hóa)
  - [Tách chính sách khỏi tham số](#tách-chính-sách-khỏi-tham-số)
  - [Dùng template làm caller mỏng](#dùng-template-làm-caller-mỏng)
- [Phân biệt template với reusable workflow](#phân-biệt-template-với-reusable-workflow)
- [Ví dụ hoàn chỉnh từ đầu đến cuối](#ví-dụ-hoàn-chỉnh-từ-đầu-đến-cuối)
  - [Mục tiêu và cấu trúc](#mục-tiêu-và-cấu-trúc)
  - [Tạo workflow template](#tạo-workflow-template)
  - [Tạo metadata](#tạo-metadata)
  - [Tạo biểu tượng tùy chọn](#tạo-biểu-tượng-tùy-chọn)
  - [Kiểm tra và phát hành](#kiểm-tra-và-phát-hành)
  - [Sử dụng và tùy biến template](#sử-dụng-và-tùy-biến-template)
  - [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Governance và chiến lược cập nhật](#governance-và-chiến-lược-cập-nhật)
  - [Quyền sở hữu và kiểm soát thay đổi](#quyền-sở-hữu-và-kiểm-soát-thay-đổi)
  - [Phiên bản và đồng bộ consumer](#phiên-bản-và-đồng-bộ-consumer)
  - [Triển khai thay đổi an toàn](#triển-khai-thay-đổi-an-toàn)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Bước tiếp theo](#bước-tiếp-theo)
- [Tài liệu tham khảo chính thức](#tài-liệu-tham-khảo-chính-thức)

## Workflow template là gì?

**Workflow template** là một file workflow mẫu được organization cung cấp để thành viên tạo workflow mới nhanh hơn. Khi người dùng chọn template trong tab **Actions**, GitHub sao chép nội dung mẫu vào repository đích dưới `.github/workflows/`. Từ thời điểm đó, bản sao thuộc repository đích và có thể được chỉnh sửa độc lập.

Ví dụ, Platform Team có thể cung cấp template **Node.js CI chuẩn của Acme**. Một repository có `package-lock.json` chọn template này, nhận file `.github/workflows/node-ci.yml`, rồi đổi ma trận phiên bản Node.js nếu dự án cần.

Template giải quyết **khâu khởi tạo**. Nó giúp mọi repository bắt đầu với trigger, quyền token, timeout và quy ước đặt tên hợp lý. Template không tự tạo một nguồn cấu hình trung tâm được đồng bộ mãi mãi.

### Luồng từ organization đến repository sử dụng

```text
Organization acme
└── Repository .github
    └── workflow-templates/
        ├── node-ci.yml
        ├── node-ci.properties.json
        └── node-ci.svg
                 │
                 │ hiển thị trong Actions → New workflow
                 ▼
Repository acme/web-store
└── .github/workflows/node-ci.yml   ← bản sao được commit vào repository này
```

Luồng thực tế có bốn bước:

1. Nhóm nền tảng lưu workflow, metadata và biểu tượng trong repository `.github` của organization.
2. GitHub đọc metadata để quyết định tên, mô tả, biểu tượng và repository phù hợp.
3. Người dùng chọn **Configure**, xem trước và chỉnh nội dung workflow.
4. Người dùng commit trực tiếp hoặc mở pull request để thêm file vào repository đích.

Không có workflow run nào được tạo chỉ vì template tồn tại trong repository `.github`. Workflow chỉ có thể chạy sau khi bản sao được commit vào `.github/workflows/` của repository đích và một sự kiện khớp khóa `on` xảy ra.

### Starter workflow và workflow template

GitHub dùng thuật ngữ **starter workflow** cho các mẫu khởi đầu xuất hiện trên trang **Choose a workflow**. Các starter workflow chung do GitHub cung cấp đến từ repository công khai [`actions/starter-workflows`](https://github.com/actions/starter-workflows). Organization cũng có thể đưa mẫu riêng lên cùng trải nghiệm giao diện; tài liệu GitHub hiện gọi các mẫu riêng này là **workflow templates**.

Trong bài này, “template” luôn chỉ mẫu do organization quản lý trong repository `.github`, trừ khi nói rõ về repository công khai `actions/starter-workflows`.

## Điều kiện phân phối

Template không được lấy từ một repository automation tùy ý. GitHub tìm nó trong một repository có tên và cấu trúc đặc biệt.

### Repository đặc biệt của organization

Tạo repository tên chính xác là `.github` dưới **organization**, ví dụ `acme/.github`. Sau đó tạo thư mục `workflow-templates` ở gốc repository đó.

```text
acme/.github/
├── workflow-templates/
│   ├── node-ci.yml
│   ├── node-ci.properties.json
│   └── node-ci.svg
└── profile/
    └── README.md
```

Repository `.github` có thể đồng thời chứa profile README và community health files. Chỉ nội dung trong `workflow-templates/` tham gia cơ chế workflow template.

<Callout type="warn" title="Đúng owner và đúng tên">
  `acme/platform-automation`, repository `.github` trong tài khoản cá nhân hoặc thư mục `.github/workflow-templates` trong từng repository ứng dụng không thay thế được `acme/.github/workflow-templates`. Owner của repository đặc biệt phải là chính organization cần phân phối template.
</Callout>

Các file cần có trên nhánh mặc định của `acme/.github` để GitHub phân phối ổn định. Với repository private hoặc internal, người cần dùng template còn phải có quyền **Read**.

### Phạm vi theo visibility

Visibility của repository `.github` quyết định loại repository đích có thể sử dụng template.

| Visibility của `acme/.github` | Repository đích có thể dùng template |
|---|---|
| Public | Public, internal và private |
| Internal | Internal và private |
| Private | Private |

Quy tắc là repository đích phải có visibility bằng hoặc hạn chế hơn repository chứa template. Ví dụ, template trong `acme/.github` private không xuất hiện cho repository public vì việc đó có thể làm lộ nội dung template.

Nếu dùng `.github` private hoặc internal, hãy cấp quyền **Read** cho user hoặc team cần xem template. Không nâng lên quyền ghi chỉ để họ sử dụng template.

## Cấu trúc thư mục và quy tắc đặt tên

Mỗi template tối thiểu là một cặp file:

```text
workflow-templates/
├── node-ci.yml
└── node-ci.properties.json
```

Quy tắc ghép cặp là:

```text
<TÊN>.yml
<TÊN>.properties.json
```

Với `node-ci.yml`, metadata phải là `node-ci.properties.json`. Không đặt thành `node-ci.yml.properties.json`, `node-ci.json` hoặc `node-ci.property.json`.

Biểu tượng SVG là file thứ ba, dùng chung basename hay không đều được. `iconName` trong metadata mới quyết định file nào được dùng:

```text
workflow-templates/
├── node-ci.yml
├── node-ci.properties.json
└── acme-ci.svg                    ← iconName: "acme-ci"
```

Nên dùng phần mở rộng `.yml` cho workflow template vì tài liệu và quy tắc ghép tên chính thức minh họa trực tiếp dạng này. Giữ basename ngắn, chữ thường và `kebab-case` giúp cặp file dễ review, ví dụ `node-ci`, `container-publish` hoặc `terraform-plan`.

## File workflow mẫu

File workflow mẫu dùng cú pháp workflow GitHub Actions thông thường, nhưng chưa nằm trong repository ứng dụng. Ví dụ tối thiểu:

```yaml
name: Organization CI

on:
  push:
    branches:
      - $default-branch
  pull_request:
    branches:
      - $default-branch

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7

      - name: Verify setup
        run: printf 'CI template is active.\n'
```

Khi repository đích có nhánh mặc định `main`, GitHub tạo file với hai giá trị `branches` là `main`. Nếu nhánh mặc định là `trunk`, hai giá trị trở thành `trunk`.

### Biến thay thế được hỗ trợ

Đối với **workflow template của organization**, tài liệu GitHub chính thức hiện chỉ cam kết biến thay thế sau:

| Biến trong file mẫu | Giá trị sau khi người dùng cấu hình |
|---|---|
| `$default-branch` | Tên nhánh mặc định của repository đích, ví dụ `main` hoặc `trunk` |

Dùng nó như một giá trị YAML thông thường:

```yaml
on:
  push:
    branches:
      - $default-branch
```

Không bọc biến trong expression và không tự đặt tên biến mới:

```yaml
# Sai: đây không phải cú pháp thay thế được tài liệu hóa
branches:
  - $repository-name
  - "{{ default_branch }}"
  - ${{ default-branch }}
```

Repository công khai `actions/starter-workflows` có pipeline xử lý riêng và README của repository đó còn liệt kê `$protected-branches` cùng `$cron-daily`. Đây là quy ước của bộ starter workflow do GitHub duy trì, không phải hợp đồng được tài liệu workflow template của organization cam kết. Với `acme/.github/workflow-templates`, chỉ nên dựa vào `$default-branch`.

<Callout type="idea" title="Khi cần giá trị khác theo repository">
  Đừng phát minh thêm biến thay thế. Hãy để comment `TODO` rõ ràng trong file được tạo, dùng organization/repository variables qua context `vars`, hoặc để template gọi reusable workflow có `inputs` được định nghĩa chính thức.
</Callout>

### Expression không phải biến thay thế

Expression như `${{ github.ref }}`, `${{ vars.NODE_VERSION }}` hoặc `${{ matrix.node-version }}` không được thay lúc người dùng chọn template. Chúng được giữ nguyên trong file đã tạo và chỉ được GitHub Actions đánh giá khi workflow chạy.

Ví dụ:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Sự khác biệt cần nhớ:

- `$default-branch` được thay **một lần khi tạo file từ template**.
- `${{ github.ref }}` được đánh giá **mỗi lần workflow chạy**.
- `${{ vars.NODE_VERSION }}` đọc configuration variable ở cấp organization, repository hoặc environment trong thời gian chạy.

## File metadata properties.json

Metadata mô tả cách template xuất hiện trong giao diện. File phải là JSON hợp lệ và có basename khớp file workflow.

```json
{
  "name": "Node.js CI chuẩn của Acme",
  "description": "Cài dependency, lint, build và test dự án Node.js dùng npm.",
  "iconName": "acme-ci",
  "categories": [
    "continuous-integration",
    "JavaScript",
    "npm"
  ],
  "filePatterns": [
    "^(package-lock\\.json|npm-shrinkwrap\\.json)$"
  ]
}
```

### Các thuộc tính metadata

| Thuộc tính | Bắt buộc | Ý nghĩa | Ví dụ |
|---|---:|---|---|
| `name` | Có | Tên card hiển thị trên trang chọn workflow | `Node.js CI chuẩn của Acme` |
| `description` | Có | Mô tả ngắn giúp người dùng chọn đúng mẫu | `Cài dependency, lint, build và test...` |
| `iconName` | Không | Basename của SVG cùng thư mục hoặc tên Octicon theo định dạng `octicon <tên>` | `acme-ci`, `octicon smiley` |
| `categories` | Không | Nhóm tổng quát, ngôn ngữ Linguist hoặc tech stack dùng để phân loại và đề xuất | `continuous-integration`, `JavaScript`, `npm` |
| `filePatterns` | Không | Danh sách regular expression đối chiếu tên file ở thư mục gốc repository đích | `^package-lock\\.json$` |

`name` và `description` trong metadata phục vụ giao diện chọn template. Chúng không thay `name` bên trong workflow. Sau khi file được tạo, `name` trong YAML mới là tên hiển thị trong danh sách workflow và workflow run.

Danh mục nên lấy từ ba nguồn mà GitHub chỉ định:

- danh mục tổng quát trong README của [`actions/starter-workflows`](https://github.com/actions/starter-workflows#categories);
- tên ngôn ngữ trong [`github-linguist/linguist`](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml);
- tech stack trong [`repo-analysis-partner`](https://github.com/github-starter-workflows/repo-analysis-partner/blob/main/tech_stacks.yml).

Không tự dịch category thành chuỗi tùy ý như `tích-hợp-liên-tục`. Người dùng vẫn đọc được tên và description tiếng Việt; category cần khớp vocabulary GitHub dùng để phân loại.

### Logo SVG và Octicon

Có hai cách đặt icon.

**Cách 1 — SVG tùy chỉnh:** đặt file `.svg` trong `workflow-templates/`, rồi dùng tên file không có phần mở rộng.

```json
{
  "name": "Node.js CI chuẩn của Acme",
  "description": "CI chuẩn cho dự án Node.js dùng npm.",
  "iconName": "acme-ci"
}
```

Cấu hình trên trỏ đến `workflow-templates/acme-ci.svg`, không phải `acme-ci.png` hay `icons/acme-ci.svg`.

**Cách 2 — Octicon:** không cần file ảnh. Dùng tên từ bộ [Primer Octicons](https://primer.style/octicons/) với tiền tố `octicon`.

```json
{
  "name": "Workflow kiểm tra mẫu",
  "description": "Workflow dùng để kiểm tra việc phân phối template.",
  "iconName": "octicon smiley"
}
```

Nếu icon tùy chỉnh không hiển thị, template vẫn có thể xuất hiện với icon mặc định. Hãy kiểm tra SVG trước khi nghi ngờ workflow YAML.

### Lọc repository bằng filePatterns

`filePatterns` giúp GitHub chỉ cung cấp template khi repository đích có file **ở thư mục gốc** khớp một regular expression đã khai báo.

Ví dụ, mẫu Node.js dùng `npm ci` nên ưu tiên repository có lockfile npm:

```json
{
  "filePatterns": [
    "^(package-lock\\.json|npm-shrinkwrap\\.json)$"
  ]
}
```

Các lớp escaping trong ví dụ là:

1. Regex cần `\.` để dấu chấm mang nghĩa ký tự dấu chấm.
2. JSON cần escape dấu `\`, nên nội dung file trở thành `\\.`.
3. Regex sau khi JSON parse sẽ là `\.` như mong muốn.

Một số mẫu thực tế:

| Ý định | Chuỗi trong `.properties.json` |
|---|---|
| Chính xác `package.json` ở root | `"^package\\.json$"` |
| `Dockerfile` hoặc tên bắt đầu bằng `Dockerfile.` ở root | `"^Dockerfile(?:\\..+)?$"` |
| File Markdown bất kỳ ở root | `".*\\.md$"` |
| `go.mod` ở root | `"^go\\.mod$"` |

Nếu bỏ `filePatterns`, metadata không giới hạn template theo tên file ở root. `filePatterns` là tín hiệu lựa chọn, không phải kiểm tra an toàn khi workflow chạy. Ví dụ, lockfile tồn tại không bảo đảm script `lint` tồn tại. Workflow vẫn nên dùng lệnh phù hợp, kiểm tra điều kiện hoặc hướng dẫn người dùng chỉnh file trước khi commit.

<Callout type="warn" title="Monorepo và file không nằm ở root">
  GitHub đối chiếu file ở thư mục gốc repository. Mẫu `^package\.json$` không phát hiện `frontend/package.json`. Với monorepo, hãy cân nhắc bỏ `filePatterns`, tạo template riêng có hướng dẫn chọn `working-directory`, hoặc dùng một dấu hiệu root ổn định như file cấu hình workspace.
</Callout>

## Template xuất hiện trong giao diện Actions

Template chỉ là một lựa chọn khởi tạo. Người dùng luôn có cơ hội xem và sửa workflow trước khi commit.

### Phía người duy trì template

Để phát hành hoặc cập nhật template:

1. Mở pull request vào nhánh mặc định của repository `acme/.github`.
2. Review đồng thời file `.yml`, file `.properties.json` và SVG nếu có.
3. Merge pull request sau khi YAML, JSON và chính sách bảo mật đạt yêu cầu.
4. Kiểm tra bằng một repository thử nghiệm có visibility và file root phù hợp.

GitHub không cung cấp một nút “publish template” riêng. Việc đưa cặp file hợp lệ lên nhánh mặc định của repository `.github` là bước phát hành.

### Phía repository sử dụng

Trong repository đích:

1. Chọn tab **Actions**.
2. Nếu repository chưa có workflow, trang **Get started with GitHub Actions** mở trực tiếp danh sách mẫu. Nếu đã có workflow, chọn **New workflow**.
3. Tìm card theo `name`, `description`, category hoặc từ khóa.
4. Chọn **Configure** trên template của organization.
5. Đọc comment hướng dẫn, sửa các giá trị dành riêng cho dự án và kiểm tra đường dẫn file đích.
6. Chọn **Start commit**, rồi commit trực tiếp hoặc mở pull request.

Sau bước **Configure**, GitHub thay `$default-branch` bằng nhánh mặc định hiện tại của repository đích. Bản xem trước là file sẽ được commit, vì vậy người dùng cần review quyền, trigger, secret và action ref như với mọi workflow khác.

<Callout type="warn" title="Template không tự tạo secret hoặc variable">
  Nếu YAML tham chiếu `${{ secrets.NPM_TOKEN }}` hoặc `${{ vars.NODE_VERSION }}`, việc chọn template không tạo các giá trị đó. Comment trong template phải chỉ rõ tên, phạm vi và nơi cấu hình; workflow cũng nên thất bại với thông báo dễ hiểu khi giá trị bắt buộc bị thiếu.
</Callout>

## Thiết kế dùng chung nhưng vẫn tùy biến

Template tốt chuẩn hóa phần cần giống nhau và để lộ đúng các điểm mà repository cần quyết định. Nếu file chứa quá nhiều nhánh điều kiện, người dùng khó biết phần nào an toàn để sửa. Nếu file quá cứng, họ sẽ xóa template hoặc copy rồi thay đổi tùy tiện.

### Chọn mức độ chuẩn hóa

Có ba mức phổ biến:

| Mức | Nội dung template | Phù hợp khi |
|---|---|---|
| Khung hướng dẫn | Trigger, permissions, job skeleton và comment `TODO` | Stack khác nhau nhiều; mục tiêu là dạy quy ước tối thiểu |
| Workflow độc lập | Toàn bộ step CI nằm trong file được tạo | Repository cần tự chủ và chấp nhận tự cập nhật |
| Caller mỏng | Trigger và tham số ở repository; logic nằm trong reusable workflow trung tâm | Organization cần sửa logic dùng chung có kiểm soát |

Ví dụ về điểm tùy biến rõ ràng:

```yaml
strategy:
  matrix:
    # Thêm hoặc bỏ phiên bản theo support policy của dự án.
    node-version:
      - "22.x"
      - "24.x"
```

Comment nói rõ quyết định nào thuộc consumer. Không nên để comment chung chung như “change this” mà không nêu tiêu chí.

### Tách chính sách khỏi tham số

**Chính sách** là phần organization muốn nhất quán, ví dụ:

- `permissions` tối thiểu;
- action bên thứ ba phải được pin theo chính sách;
- timeout và concurrency;
- job bảo mật bắt buộc;
- môi trường deployment và approval.

**Tham số** là phần thay đổi hợp lệ theo repository, ví dụ phiên bản runtime, thư mục package, lệnh build hoặc environment đích.

Một template độc lập có thể đưa tham số vào `env` ở đầu file:

```yaml
env:
  NODE_VERSION: "24.x" # Repository có thể thay đổi theo support policy.
  PACKAGE_DIRECTORY: "."
```

Một reusable workflow nên đưa tham số vào `on.workflow_call.inputs`. Caller được tạo từ template sẽ truyền input bằng `with`, nhờ đó hợp đồng có kiểu và mô tả rõ hơn.

Không đặt secret thật, URL nội bộ nhạy cảm hoặc credential mặc định vào template. Chỉ tham chiếu tên secret và tài liệu hóa cách cấp quyền tối thiểu.

### Dùng template làm caller mỏng

Template có thể tạo một workflow chỉ chứa trigger, permissions và lệnh gọi reusable workflow trung tâm:

```yaml
name: Organization Node.js CI

on:
  push:
    branches:
      - $default-branch
  pull_request:
    branches:
      - $default-branch

permissions:
  contents: read

jobs:
  ci:
    uses: acme/automation/.github/workflows/node-ci.yml@v2
    with:
      node-version: "24.x"
```

Cách này giữ trải nghiệm onboarding của template nhưng tập trung logic thực thi trong `acme/automation`. Repository đích vẫn kiểm soát trigger và input. Nhóm nền tảng kiểm soát các job bên trong reusable workflow.

Để caller hoạt động, repository chứa reusable workflow phải cho phép repository đích truy cập. Với reusable workflow private, vào **Settings → Actions → General → Access** của repository chứa workflow và cho phép các repository trong organization sử dụng.

`@v2` dễ đọc nhưng là ref có thể di chuyển. Nếu chính sách chuỗi cung ứng yêu cầu bất biến, caller nên pin full commit SHA và thêm comment phiên bản:

```yaml
jobs:
  ci:
    # acme/automation node-ci v2.3.1
    uses: acme/automation/.github/workflows/node-ci.yml@0123456789abcdef0123456789abcdef01234567
    with:
      node-version: "24.x"
```

SHA trên chỉ minh họa định dạng 40 ký tự. Khi triển khai thật, phải lấy full SHA của commit đã review trong repository `acme/automation`, không sao chép giá trị minh họa.

## Phân biệt template với reusable workflow

Hai cơ chế đều giảm lặp nhưng hoạt động ở hai thời điểm khác nhau.

| Tiêu chí | Workflow template | Reusable workflow |
|---|---|---|
| Mục đích | Khởi tạo workflow mới nhất quán | Thực thi logic workflow dùng chung |
| Nơi lưu | `ORG/.github/workflow-templates/` | `.github/workflows/*.yml` trong repository chia sẻ |
| Cách dùng | Chọn **Actions → New workflow → Configure** | Gọi bằng `jobs.<job_id>.uses` |
| Thời điểm tái sử dụng | Lúc tạo file | Mỗi workflow run |
| Kết quả | Một bản sao được commit vào repository đích | Caller chạy workflow ở ref đã khai báo |
| Cập nhật nguồn | Không tự cập nhật bản sao cũ | Caller nhận nội dung ở branch, tag hoặc SHA đang tham chiếu |
| Tùy biến | Sửa trực tiếp file đã tạo | Truyền `with`, `secrets` và dùng interface được công bố |
| Trigger | Template có thể tạo trigger trong bản sao | Caller sở hữu trigger; called workflow khai báo `workflow_call` |

Quy tắc chọn nhanh:

- Dùng **template** khi cần một điểm bắt đầu có thể sửa theo từng repository.
- Dùng **reusable workflow** khi cần một implementation trung tâm được gọi trong lúc chạy.
- Dùng **cả hai** khi muốn onboarding đơn giản nhưng vẫn duy trì logic CI hoặc deployment tập trung.

<Callout type="info" title="Template không phải cơ chế enforcement">
  Vì consumer có thể sửa hoặc xóa file đã tạo, template không bảo đảm mọi repository tuân thủ chính sách mãi mãi. Với yêu cầu bắt buộc, hãy kết hợp ruleset, required status checks, Actions policy, review bằng `CODEOWNERS` và audit định kỳ.
</Callout>

## Ví dụ hoàn chỉnh từ đầu đến cuối

Bài thực hành này tạo một template Node.js CI độc lập. Workflow dùng `npm ci`, nên metadata chỉ đề xuất template cho repository có `package-lock.json` hoặc `npm-shrinkwrap.json` ở root.

### Mục tiêu và cấu trúc

Bạn cần:

- quyền tạo hoặc cập nhật repository `ORG/.github`;
- một repository Node.js thử nghiệm trong cùng organization;
- lockfile npm ở thư mục gốc repository thử nghiệm;
- GitHub Actions được bật.

Trong các lệnh dưới đây, thay `acme` bằng tên organization thật.

Cấu trúc cần tạo trong repository `acme/.github`:

```text
.github/
└── workflow-templates/
    ├── node-ci.yml
    ├── node-ci.properties.json
    └── acme-ci.svg
```

### Tạo workflow template

Tạo `workflow-templates/node-ci.yml`:

```yaml
name: Organization Node.js CI

on:
  push:
    branches:
      - $default-branch
  pull_request:
    branches:
      - $default-branch
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: node-ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Node.js ${{ matrix.node-version }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        # Điều chỉnh theo các phiên bản Node.js mà dự án hỗ trợ.
        node-version:
          - "22.x"
          - "24.x"

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint if configured
        run: npm run lint --if-present

      - name: Build if configured
        run: npm run build --if-present

      - name: Test if configured
        run: npm run test --if-present
```

Workflow có các mặc định có chủ đích:

- chỉ chạy `push` và `pull_request` đối với nhánh mặc định được thay lúc cấu hình;
- có `workflow_dispatch` để chạy thủ công sau khi file ở nhánh mặc định;
- chỉ cấp `contents: read` cho `GITHUB_TOKEN`;
- hủy run CI cũ trên cùng ref;
- đặt timeout để job treo không giữ runner quá lâu;
- dùng cache tích hợp của `actions/setup-node` với lockfile npm;
- cho phép consumer chỉnh ma trận Node.js ở một vị trí rõ ràng.

### Tạo metadata

Tạo `workflow-templates/node-ci.properties.json`:

```json
{
  "name": "Node.js CI chuẩn của Acme",
  "description": "Cài dependency, lint, build và test dự án Node.js dùng npm.",
  "iconName": "acme-ci",
  "categories": [
    "continuous-integration",
    "JavaScript",
    "npm"
  ],
  "filePatterns": [
    "^(package-lock\\.json|npm-shrinkwrap\\.json)$"
  ]
}
```

Tên `node-ci` khớp giữa `node-ci.yml` và `node-ci.properties.json`. `iconName` không cần trùng basename workflow; nó trỏ đến `acme-ci.svg`.

### Tạo biểu tượng tùy chọn

Tạo `workflow-templates/acme-ci.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img">
  <title>Acme CI</title>
  <circle cx="12" cy="12" r="10" fill="#2da44e" />
  <path
    d="M7 12l3 3 7-7"
    fill="none"
    stroke="#ffffff"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
```

Nếu không muốn quản lý SVG, xóa file này và đổi `iconName` trong metadata thành một Octicon hợp lệ, ví dụ `octicon smiley`.

### Kiểm tra và phát hành

Chạy các kiểm tra cục bộ từ root repository `acme/.github`:

```bash
python3 -m json.tool workflow-templates/node-ci.properties.json >/dev/null
git diff --check
git status --short
```

`python3 -m json.tool` không in lỗi nghĩa là JSON hợp lệ. Tiếp theo, kiểm tra ba file có mặt và basename ghép đúng:

```bash
test -f workflow-templates/node-ci.yml
test -f workflow-templates/node-ci.properties.json
test -f workflow-templates/acme-ci.svg
```

Mở pull request thay vì push thẳng vào nhánh mặc định:

```bash
git add workflow-templates/node-ci.yml \
  workflow-templates/node-ci.properties.json \
  workflow-templates/acme-ci.svg
git commit -m "ci: add organization Node.js workflow template"
git push -u origin "$(git branch --show-current)"
```

Trong pull request, reviewer cần kiểm tra:

- YAML là một workflow hợp lệ sau khi `$default-branch` được thay bằng tên nhánh thật;
- mọi action ref tuân thủ chính sách pin của organization;
- `permissions` không rộng hơn nhu cầu;
- regex trong JSON đã escape đúng;
- template không chứa secret, token hoặc hostname nhạy cảm;
- comment chỉ ra những giá trị consumer cần quyết định.

Merge pull request vào nhánh mặc định sau khi review.

### Sử dụng và tùy biến template

Trong repository Node.js thử nghiệm:

1. Xác nhận root có `package-lock.json` hoặc `npm-shrinkwrap.json`.
2. Mở **Actions → New workflow**.
3. Tìm **Node.js CI chuẩn của Acme** và chọn **Configure**.
4. Xác nhận `$default-branch` đã trở thành tên nhánh mặc định, ví dụ `main`.
5. Xem ma trận Node.js. Bỏ phiên bản mà dự án không hỗ trợ hoặc cập nhật `engines.node` trong `package.json` trước khi giữ cả hai.
6. Kiểm tra script `lint`, `build` và `test`. Ví dụ này dùng `--if-present`, nên script không tồn tại sẽ được bỏ qua; dự án có quality gate bắt buộc nên thay bằng lệnh không có `--if-present`.
7. Chọn **Start commit** và mở pull request để review file `.github/workflows/node-ci.yml`.
8. Merge rồi quan sát workflow run do `push`, hoặc chạy thủ công bằng **Run workflow**.

Để chứng minh quality gate hoạt động, tạm sửa script `test` trả mã khác `0` trên một nhánh thử nghiệm. Pull request phải có check đỏ. Khôi phục test và push lại; check phải trở về xanh.

### Tiêu chí kiểm chứng

| Tiêu chí | Bằng chứng cần thấy |
|---|---|
| Repository nguồn đúng | Ba file nằm trong `acme/.github/workflow-templates/` trên nhánh mặc định |
| Metadata hợp lệ | `python3 -m json.tool` thành công; tên card và mô tả hiển thị đúng |
| Bộ lọc hoạt động | Template xuất hiện trong repository có lockfile npm ở root |
| Icon hoạt động | Card dùng `acme-ci.svg`, hoặc dùng Octicon đã chọn |
| Biến được thay đúng | File xem trước không còn `$default-branch`; thay vào đó là `main`, `trunk` hoặc nhánh mặc định thật |
| File được tạo đúng nơi | Repository đích có `.github/workflows/node-ci.yml` |
| Quyền tối thiểu | Workflow đã tạo có `permissions: contents: read` |
| Workflow thực thi được | Các job trong matrix được tạo và run kết thúc **Success** trên dự án tương thích |
| Quality gate phát hiện lỗi | Test cố ý thất bại làm check đỏ; sửa test làm check xanh |
| Bản sao tùy biến được | Consumer có thể đổi ma trận Node.js trong pull request mà không sửa template nguồn |

## Governance và chiến lược cập nhật

Template là sản phẩm nội bộ có consumer. Vì vậy, thay đổi template cần owner, review, phiên bản và kế hoạch migration giống một API nhỏ.

### Quyền sở hữu và kiểm soát thay đổi

Áp dụng các lớp kiểm soát sau cho repository `.github`:

- chỉ Platform Team hoặc team CI có quyền ghi vào `workflow-templates/`;
- bảo vệ nhánh mặc định và yêu cầu pull request review;
- thêm `CODEOWNERS` cho `workflow-templates/**`;
- chạy validation cho YAML, JSON, SVG và secret scanning;
- kiểm tra action bên thứ ba, quyền `GITHUB_TOKEN` và nguy cơ script injection;
- thử template trên repository sandbox trước khi đưa vào sử dụng rộng;
- ghi owner và kênh hỗ trợ trong comment đầu workflow hoặc tài liệu organization.

Ví dụ quy tắc `CODEOWNERS` trong repository `.github`:

```text
/workflow-templates/ @acme/platform-engineering @acme/security-engineering
```

`CODEOWNERS` hỗ trợ review nhưng chỉ trở thành cổng bắt buộc khi branch protection hoặc ruleset yêu cầu code owner review.

Template không thay thế policy. Dùng organization Actions policy để giới hạn action được phép chạy. Dùng ruleset và required checks để buộc repository thỏa tiêu chuẩn quan trọng.

### Phiên bản và đồng bộ consumer

Điểm dễ nhầm nhất là **cập nhật template không sửa các workflow đã được tạo trước đó**. Nếu `acme/.github` đổi `actions/checkout@v7` thành phiên bản mới, chỉ consumer cấu hình template sau thay đổi mới nhận nội dung mới.

Chọn chiến lược theo loại template:

| Chiến lược | Cách cập nhật | Đánh đổi |
|---|---|---|
| Bản sao độc lập | Bot hoặc pull request cập nhật từng `.github/workflows/*.yml` | Consumer tự chủ, nhưng dễ drift |
| Caller dùng tag major | Template gọi reusable workflow bằng `@v2` | Nhận bản sửa trong major thuận tiện, nhưng tag có thể di chuyển |
| Caller pin full SHA | Bot mở pull request đổi SHA theo release | Bất biến và review được, nhưng cần automation cập nhật |
| Caller dùng branch | Mọi run lấy nội dung hiện tại của branch | Cập nhật tức thì nhưng blast radius lớn; tránh cho production |

Với action và reusable workflow được tham chiếu bằng cú pháp GitHub, Dependabot có thể hỗ trợ mở pull request cập nhật dependency GitHub Actions. Ngoài ra, organization có thể dùng GitHub API hoặc code search để lập inventory các repository còn dùng revision cũ.

Nên ghi một marker có cấu trúc vào workflow được tạo để audit dễ hơn:

```yaml
# template-source: acme/.github/workflow-templates/node-ci.yml
# template-revision: 2.1.0
```

Hai comment này không tạo cơ chế update tự động. Chúng chỉ giúp bot và reviewer nhận diện nguồn cùng revision ban đầu.

### Triển khai thay đổi an toàn

Phân loại thay đổi trước khi phát hành:

- **Patch:** sửa comment, typo hoặc cập nhật action không đổi hành vi công khai.
- **Minor:** thêm job/step không breaking, thêm input tùy chọn hoặc hỗ trợ runtime mới.
- **Major:** đổi trigger, xóa runtime, tăng quyền, đổi secret/input bắt buộc hoặc thay behavior quality gate.

Quy trình rollout khuyến nghị:

1. Tạo hoặc cập nhật template trong nhánh thử nghiệm.
2. Sinh workflow từ nội dung đó trong repository sandbox và chạy cả trường hợp thành công lẫn thất bại.
3. Với thay đổi ảnh hưởng bảo mật hoặc quyền, yêu cầu Security review.
4. Merge template mới và công bố changelog ngắn.
5. Mở pull request pilot cho một nhóm repository đại diện.
6. Theo dõi lỗi, thời gian chạy và chi phí runner.
7. Mở rộng rollout bằng bot hoặc chiến dịch pull request.
8. Giữ bản cũ trong thời gian migration nếu consumer chưa thể chuyển ngay; đặt tên rõ như `Node.js CI v1` và `Node.js CI v2`.
9. Sau thời hạn, xóa template cũ khỏi danh sách nhưng vẫn theo dõi các bản sao cũ cho đến khi migration hoàn tất.

Không sửa một tag reusable workflow major để đưa breaking change vào âm thầm. Phát hành major mới, cập nhật template và để consumer review migration.

## Best practices

- **Giữ một mục đích trên mỗi template:** tách `Node.js CI`, `Publish package` và `Deploy production` nếu chúng có trigger, quyền hoặc đối tượng sử dụng khác nhau.
- **Đặt tên card theo kết quả:** `Node.js CI chuẩn của Acme` dễ chọn hơn `Workflow 1`.
- **Viết description ngắn nhưng phân biệt được:** nêu stack, package manager và tác vụ chính.
- **Dùng `$default-branch` đúng phạm vi:** chỉ dùng khi file mẫu cần tên nhánh mặc định. Không tự tạo biến thay thế khác.
- **Giới hạn `filePatterns`:** regex phải phản ánh điều kiện tiên quyết ở root. Regex quá rộng làm template xuất hiện ở repository không phù hợp; regex quá hẹp che mất template cần thiết.
- **Để điểm tùy biến ở một nơi rõ ràng:** dùng comment có tiêu chí, `env`, matrix hoặc reusable workflow inputs.
- **Cấp quyền tối thiểu:** khai báo `permissions` rõ ràng. Tách job cần quyền ghi khỏi job đọc mã không tin cậy.
- **Không nhúng secret:** chỉ tham chiếu `secrets` và giải thích nơi cấu hình. Không đặt credential giả dễ bị dùng nhầm làm credential thật.
- **Đặt timeout và concurrency:** template là cơ hội đưa mặc định vận hành an toàn vào mọi repository mới.
- **Pin dependency theo policy:** với bên thứ ba, full commit SHA là lựa chọn bất biến. Dùng bot để cập nhật thay vì dùng `@main`.
- **Ưu tiên caller mỏng khi logic phải đồng bộ:** để template tạo giao diện tại repository, còn reusable workflow giữ implementation trung tâm.
- **Coi bản sao là code của consumer:** mọi file được tạo phải qua pull request review, không commit mù từ giao diện.
- **Kiểm thử cả discoverability lẫn execution:** JSON hợp lệ chưa chứng minh card xuất hiện; card xuất hiện chưa chứng minh workflow chạy.
- **Gắn owner và revision:** comment nguồn giúp hỗ trợ, inventory và migration.
- **Không dùng template để giả lập enforcement:** chính sách bắt buộc cần ruleset, required checks và Actions policy.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Template không xuất hiện trong **Actions → New workflow** | Repository nguồn không tên `.github`, không thuộc đúng organization hoặc file chưa ở nhánh mặc định | Xác nhận URL là `github.com/ORG/.github`, thư mục là `workflow-templates/` và commit đã merge vào default branch |
| Một số thành viên thấy template, người khác không thấy | Repository `.github` private/internal nhưng user hoặc team thiếu quyền **Read** | Cấp quyền đọc cho team cần sử dụng; không cần cấp quyền ghi |
| Template xuất hiện cho private repo nhưng không xuất hiện cho public repo | Repository `.github` có visibility private/internal | Dùng `.github` public nếu nội dung template có thể công khai và cần phục vụ repository public |
| Template không xuất hiện ở repository Node.js mong muốn | `filePatterns` không khớp file root, lockfile nằm trong thư mục con hoặc regex escape sai | Kiểm tra tên file ở root; parse JSON; tạm bỏ `filePatterns` để cô lập lỗi rồi viết lại regex hẹp |
| Template xuất hiện ở repository không liên quan | Regex quá rộng, ví dụ thiếu `^` và `$`, hoặc category chỉ mang tính gợi ý | Neo regex theo toàn bộ tên file và chọn dấu hiệu stack cụ thể hơn |
| GitHub không ghép workflow với metadata | Basename sai, ví dụ `node-ci.yml` đi với `node.properties.json` | Đổi thành cặp `node-ci.yml` và `node-ci.properties.json` |
| Card không có tên hoặc mô tả mong muốn | JSON thiếu `name`/`description`, JSON sai cú pháp hoặc đang sửa nhầm cặp metadata | Chạy `python3 -m json.tool`, kiểm tra basename và merge bản sửa vào nhánh mặc định |
| Icon không hiển thị | `iconName` có phần mở rộng, SVG nằm sai thư mục hoặc tên Octicon không hợp lệ | Dùng `"iconName": "acme-ci"` cho `workflow-templates/acme-ci.svg`, hoặc chọn tên trên Primer Octicons |
| `$default-branch` còn nguyên trong file đã commit | File được copy thủ công thay vì chọn **Configure**, hoặc viết sai chính tả/cú pháp | Tạo lại qua giao diện template hoặc thay thủ công bằng nhánh mặc định; dùng chính xác `$default-branch` |
| Biến tự đặt như `$repository-name` còn nguyên | GitHub không hỗ trợ biến đó cho organization template | Thay bằng comment hướng dẫn, `vars` runtime hoặc reusable workflow input |
| Workflow đã tạo không chạy khi push | Branch filter đã được thay bằng nhánh mặc định nhưng bạn push nhánh khác; Actions bị tắt; YAML lỗi | Mở pull request vào default branch, dùng `workflow_dispatch` sau khi file có trên default branch và kiểm tra tab Actions |
| Không thấy nút **Run workflow** | File chưa có trên nhánh mặc định, thiếu `workflow_dispatch` hoặc user thiếu quyền ghi | Merge file vào default branch, thêm trigger và kiểm tra quyền repository |
| `npm ci` báo cần lockfile | Repository chỉ có `package.json`, lockfile không được commit hoặc working directory sai | Commit `package-lock.json`, dùng package manager đúng hoặc chỉnh template cho monorepo |
| Cache của `setup-node` không tìm thấy dependency file | Lockfile không ở root hoặc `cache-dependency-path` chưa chỉ đúng path | Thêm `cache-dependency-path`, ví dụ `frontend/package-lock.json`, trong bản workflow của consumer |
| Workflow gọi reusable workflow báo không tìm thấy hoặc không được phép truy cập | Sai owner/repository/path/ref hoặc repository private chưa bật quyền chia sẻ Actions | Kiểm tra `jobs.<id>.uses`; cấu hình **Settings → Actions → General → Access** ở repository chứa reusable workflow |
| Sửa template nhưng repository cũ không đổi | Template chỉ được sao chép lúc cấu hình | Mở pull request cập nhật consumer, dùng bot/Dependabot hoặc chuyển logic chung sang reusable workflow |
| Thay đổi reusable workflow làm nhiều repository lỗi cùng lúc | Caller dùng branch/tag di chuyển và thay đổi chưa qua rollout | Khôi phục ref an toàn, phát hành phiên bản mới, thử trên sandbox rồi cập nhật consumer theo từng đợt |
| Workflow được tạo có quyền quá rộng | Template dùng `write-all` hoặc sao chép cấu hình deployment vào CI | Đặt `permissions: contents: read` ở mặc định và chỉ nâng scope tại job thật sự cần ghi |

## Bước tiếp theo

<Cards>
  <Card title="Reusable workflows" href="/docs/tai-su-dung-actions/01-reusable-workflows/" description="Đưa logic nhiều job vào workflow trung tâm và thiết kế interface bằng inputs, secrets, outputs." />
  <Card title="Composite actions" href="/docs/tai-su-dung-actions/03-composite-actions/" description="Gom chuỗi step lặp lại thành một action dùng ở cấp step." />
  <Card title="Action metadata" href="/docs/tai-su-dung-actions/06-action-metadata/" description="Thiết kế metadata, input và output cho custom action." />
  <Card title="Phát hành và version actions" href="/docs/tai-su-dung-actions/07-publish-version-actions/" description="Quản lý tag, release và chiến lược cập nhật dependency automation." />
</Cards>

## Tài liệu tham khảo chính thức

- [Creating workflow templates for your organization](https://docs.github.com/en/actions/how-tos/reuse-automations/create-workflow-templates)
- [Using workflow templates](https://docs.github.com/en/actions/how-tos/write-workflows/use-workflow-templates)
- [Workflow templates reference](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#workflow-templates)
- [Reusing workflow configurations](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
- [Sharing actions and workflows with your organization](https://docs.github.com/en/actions/how-tos/reuse-automations/share-with-your-organization)
- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub-maintained starter workflows](https://github.com/actions/starter-workflows)
- [Primer Octicons](https://primer.style/octicons/)
- [GitHub Linguist languages](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml)
- [Supported tech stacks for starter workflows](https://github.com/github-starter-workflows/repo-analysis-partner/blob/main/tech_stacks.yml)
