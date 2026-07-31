---
title: "Action metadata"
description: "Tham chiếu action.yml cho JavaScript, Docker container và composite action: inputs, outputs, runs, expressions và cách kiểm chứng schema."
---

<Callout type="info" title="Phạm vi của bài">
  Bài này chỉ nói về file metadata của **custom action**: `action.yml` hoặc `action.yaml`. Theo reference hiện hành của GitHub, ba loại được hỗ trợ là JavaScript action, Docker container action và composite action. Metadata không phải workflow, vì vậy không có `on`, `jobs`, `runs-on` hay `permissions`.
</Callout>

## Mục lục

- [Khung metadata và phạm vi](#khung-metadata-và-phạm-vi)
  - [Tên file và vị trí](#tên-file-và-vị-trí)
  - [So sánh ba loại action](#so-sánh-ba-loại-action)
- [Thuộc tính cấp cao](#thuộc-tính-cấp-cao)
  - [Tên mô tả và tác giả](#tên-mô-tả-và-tác-giả)
  - [Branding trên Marketplace](#branding-trên-marketplace)
- [Khai báo inputs](#khai-báo-inputs)
  - [Schema và quy tắc đặt ID](#schema-và-quy-tắc-đặt-id)
  - [Cách mỗi loại action đọc input](#cách-mỗi-loại-action-đọc-input)
  - [Input cũ và deprecationMessage](#input-cũ-và-deprecationmessage)
- [Khai báo outputs](#khai-báo-outputs)
  - [JavaScript và Docker container action](#javascript-và-docker-container-action)
  - [Composite action](#composite-action)
  - [Giới hạn và cách đọc output](#giới-hạn-và-cách-đọc-output)
- [Cấu hình runs cho JavaScript action](#cấu-hình-runs-cho-javascript-action)
  - [Runtime và entrypoint chính](#runtime-và-entrypoint-chính)
  - [Script pre và post](#script-pre-và-post)
- [Cấu hình runs cho Docker container action](#cấu-hình-runs-cho-docker-container-action)
  - [Image và nền tảng chạy](#image-và-nền-tảng-chạy)
  - [Entrypoint args và env](#entrypoint-args-và-env)
  - [Lifecycle của container](#lifecycle-của-container)
- [Cấu hình runs cho composite action](#cấu-hình-runs-cho-composite-action)
  - [Các thuộc tính của step nội bộ](#các-thuộc-tính-của-step-nội-bộ)
  - [Shell đường dẫn và môi trường](#shell-đường-dẫn-và-môi-trường)
- [Expressions trong action metadata](#expressions-trong-action-metadata)
  - [Vị trí hỗ trợ expression](#vị-trí-hỗ-trợ-expression)
  - [Cú pháp và giới hạn quan trọng](#cú-pháp-và-giới-hạn-quan-trọng)
- [Ba ví dụ metadata hoàn chỉnh](#ba-ví-dụ-metadata-hoàn-chỉnh)
  - [Ví dụ JavaScript action](#ví-dụ-javascript-action)
  - [Ví dụ Docker container action](#ví-dụ-docker-container-action)
  - [Ví dụ composite action](#ví-dụ-composite-action)
- [Validation metadata](#validation-metadata)
  - [Kiểm tra tĩnh tại máy phát triển](#kiểm-tra-tĩnh-tại-máy-phát-triển)
  - [Kiểm tra bằng GitHub runner](#kiểm-tra-bằng-github-runner)
- [Bài thực hành và kiểm chứng](#bài-thực-hành-và-kiểm-chứng)
  - [Chuẩn bị ba action](#chuẩn-bị-ba-action)
  - [Workflow gọi action local](#workflow-gọi-action-local)
  - [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Checklist review](#checklist-review)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Nguồn chính thức](#nguồn-chính-thức)
- [Bài liên quan](#bài-liên-quan)

## Khung metadata và phạm vi

File metadata là hợp đồng giữa action và workflow gọi nó. GitHub đọc file này để biết tên action, input nào được nhận, output nào được công bố và runner phải thực thi action theo cách nào.

Khung chung có dạng:

```yaml
name: "Tên action"
description: "Một câu mô tả trách nhiệm của action"
author: "Tên cá nhân hoặc tổ chức"

inputs: {}
outputs: {}

runs:
  # Schema bên dưới phụ thuộc loại action.

branding:
  icon: "check-circle"
  color: "blue"
```

`name`, `description` và `runs` là bắt buộc. `author`, `inputs`, `outputs` và `branding` là tùy chọn. Tuy nhiên, một action public nên khai báo mọi input/output mà người dùng cần biết, kể cả khi runtime có thể tạo một output chưa được khai báo.

### Tên file và vị trí

Tên file hợp lệ là `action.yml` hoặc `action.yaml`; GitHub khuyến nghị `action.yml`. File phải nằm ngay trong thư mục mà `uses` trỏ đến:

```text
repository/
├── .github/
│   ├── actions/
│   │   └── normalize/
│   │       ├── action.yml
│   │       └── ...
│   └── workflows/
│       └── test.yml
└── ...
```

Workflow gọi action trên bằng `uses: ./.github/actions/normalize`, không trỏ thẳng đến `action.yml`. Với action phát hành ở root repository, consumer dùng `OWNER/REPOSITORY@REF`.

<Callout type="warn" title="Không đổi đuôi file tùy tiện sau khi phát hành">
  GitHub cảnh báo rằng đổi từ `action.yml` sang `action.yaml`, hoặc ngược lại, giữa các release sẽ làm các phiên bản Marketplace gắn với tên cũ bị ẩn khỏi Marketplace. Ref cũ vẫn dùng được từ source repository, nhưng lịch sử niêm yết bị ảnh hưởng.
</Callout>

### So sánh ba loại action

| Loại action | Giá trị phân loại | Nội dung bắt buộc trong `runs` | Nơi logic chạy |
|---|---|---|---|
| JavaScript | `using: node20` hoặc `using: node24` | `using`, `main` | Node.js runtime do runner cung cấp |
| Docker container | `using: docker` | `using`, `image` | Container Linux được build hoặc kéo từ registry |
| Composite | `using: composite` | `using`, `steps` | Các step nội bộ trên chính runner của caller |

Một file metadata chỉ chọn **một** schema `runs`. Không trộn `main` của JavaScript với `steps` của composite hoặc `image` của Docker.

## Thuộc tính cấp cao

### Tên mô tả và tác giả

| Thuộc tính | Bắt buộc | Kiểu | Ý nghĩa |
|---|---:|---|---|
| `name` | Có | string | Tên hiển thị trong tab Actions để nhận diện action trong job |
| `description` | Có | string | Mô tả ngắn trách nhiệm của action |
| `author` | Không | string | Tên tác giả hoặc tổ chức duy trì action |

Đây là metadata tĩnh, không phải nơi dùng context hoặc secret. Giữ `description` ngắn và mô tả kết quả thay vì cách triển khai:

```yaml
name: "Normalize release label"
description: "Chuẩn hóa nhãn phát hành và công bố slug cho step sau"
author: "Platform Engineering"
```

Dấu hai chấm, `#`, chuỗi giống boolean và ký tự đặc biệt dễ bị YAML diễn giải ngoài ý muốn. Dùng dấu nháy cho chuỗi mô tả là lựa chọn an toàn và nhất quán.

### Branding trên Marketplace

`branding` chỉ điều khiển badge hiển thị cạnh action trên GitHub Marketplace. Nó không đổi cách action chạy:

```yaml
branding:
  icon: "package"
  color: "purple"
```

`color` chỉ nhận một trong các giá trị:

```text
white, black, yellow, blue, green, orange, red, purple, gray-dark
```

`icon` là tên icon được GitHub hỗ trợ từ Feather Icons 4.28.0. Không phải mọi icon Feather đều được cho phép; một số brand icon và icon như `coffee`, `key`, `tool`, `x-octagon` bị loại. Hãy đối chiếu danh sách đầy đủ trong metadata reference trước khi publish.

## Khai báo inputs

### Schema và quy tắc đặt ID

Mỗi input nằm dưới `inputs.<input_id>`:

```yaml
inputs:
  target-path:
    description: "Đường dẫn tương đối cần xử lý"
    required: true
  format:
    description: "Định dạng kết quả: text hoặc json"
    required: false
    default: "text"
  legacy-mode:
    description: "Chế độ tương thích cũ"
    required: false
    deprecationMessage: "Input legacy-mode sẽ bị xóa ở v3; hãy dùng format."
```

Schema hiện hành của một input gồm:

| Thuộc tính | Bắt buộc | Kiểu | Hành vi |
|---|---:|---|---|
| `description` | Có | string | Giải thích dữ liệu, định dạng và đơn vị nếu có |
| `required` | Không | boolean | Đánh dấu hợp đồng bắt buộc; dùng `true` hoặc `false` không có dấu nháy |
| `default` | Không | string | Giá trị dùng khi caller không truyền input |
| `deprecationMessage` | Không | string | Ghi warning khi caller sử dụng input đã cũ |

`input_id` phải duy nhất trong `inputs`, bắt đầu bằng chữ cái hoặc `_`, và chỉ chứa chữ cái, số, `-`, `_`. GitHub khuyến nghị ID chữ thường. Ví dụ hợp lệ: `path`, `_mode`, `target-path`; ví dụ không hợp lệ: `1path`, `target.path`, `target path`.

<Callout type="warn" title="required không tự validation">
  Theo tài liệu GitHub, `required: true` không tự làm action thất bại khi input bị thiếu. JavaScript, shell hoặc chương trình trong container vẫn phải kiểm tra chuỗi rỗng, enum, độ dài, path và kiểu dữ liệu trước khi sử dụng.
</Callout>

Mọi input action về bản chất là chuỗi. Vì vậy, hãy quote các default trông giống kiểu khác:

```yaml
inputs:
  enabled:
    description: "Bật xử lý bổ sung"
    default: "false"
  retry-count:
    description: "Số lần thử lại"
    default: "3"
```

Runtime phải parse `"false"` thành boolean và `"3"` thành số, sau đó kiểm tra miền giá trị.

### Cách mỗi loại action đọc input

| Loại action | Cách nhận input nên dùng |
|---|---|
| JavaScript | Actions Toolkit như `core.getInput('target-path')`, hoặc biến môi trường `INPUT_TARGET-PATH` qua API process |
| Docker container | Ánh xạ `${{ inputs.<id> }}` vào `runs.args`, rồi đọc positional argument trong entrypoint |
| Composite | Dùng `${{ inputs.<id> }}` trong step; nếu script cần biến môi trường, ánh xạ rõ ràng qua `runs.steps[*].env` |

GitHub tạo biến `INPUT_<TÊN_INPUT_VIẾT_HOA>` cho action thông thường, nhưng composite action **không tự nhận** các biến này. Với ID chứa dấu gạch nối, shell không thể đọc bằng cú pháp `$INPUT_TARGET-PATH`; JavaScript có thể dùng `process.env['INPUT_TARGET-PATH']`, còn Actions Toolkit xử lý chi tiết này tốt hơn.

Mẫu an toàn trong composite action là chuyển expression sang `env`, rồi quote biến trong shell:

```yaml
runs:
  using: "composite"
  steps:
    - name: "Kiểm tra target"
      shell: bash
      env:
        TARGET_PATH: ${{ inputs.target-path }}
      run: |
        test -n "$TARGET_PATH" || {
          echo "::error::target-path không được rỗng"
          exit 1
        }
```

### Input cũ và deprecationMessage

`deprecationMessage` được hỗ trợ trong schema input hiện hành và áp dụng cho cả ba loại action. Khi caller còn truyền input đó, runner ghi một warning:

```yaml
inputs:
  output-file:
    description: "Tên output cũ"
    required: false
    deprecationMessage: "output-file đã deprecated; hãy dùng destination trước v3."
  destination:
    description: "Đường dẫn file kết quả"
    required: false
    default: "report.json"
```

Thông báo nên nêu rõ input thay thế và mốc xóa dự kiến. Trong giai đoạn chuyển tiếp, implementation cần tiếp tục xử lý input cũ hoặc báo lỗi migration rõ ràng. Chỉ thêm warning nhưng âm thầm bỏ qua giá trị sẽ tạo kết quả khó đoán.

## Khai báo outputs

Output là chuỗi metadata nhỏ được step sau đọc qua `steps.<step_id>.outputs.<output_id>`. Cách khai báo khác nhau giữa JavaScript/Docker và composite action.

ID output tuân theo cùng mẫu với ID input: bắt đầu bằng chữ cái hoặc `_`, sau đó chỉ dùng chữ cái, số, `-`, `_`.

### JavaScript và Docker container action

Metadata chỉ mô tả output; runtime chịu trách nhiệm tạo giá trị:

```yaml
outputs:
  normalized-path:
    description: "Đường dẫn đã chuẩn hóa"
  file-count:
    description: "Số file đã xử lý"
```

JavaScript action thường dùng `core.setOutput(name, value)` hoặc ghi vào file `$GITHUB_OUTPUT`. Docker entrypoint ghi trực tiếp vào `$GITHUB_OUTPUT` được mount vào container:

```bash
printf 'file-count=%s\n' "$count" >> "$GITHUB_OUTPUT"
```

GitHub cho phép JavaScript và Docker action đặt một output chưa khai báo rồi caller vẫn đọc nó. Đừng dựa vào khả năng này trong action được chia sẻ: output không khai báo không có tài liệu, khó review và dễ biến mất mà không được xem là breaking change.

### Composite action

Composite action phải ánh xạ output công khai đến một giá trị, thường là output của step nội bộ:

```yaml
outputs:
  normalized-path:
    description: "Đường dẫn đã chuẩn hóa"
    value: ${{ steps.normalize.outputs.path }}

runs:
  using: "composite"
  steps:
    - name: "Chuẩn hóa path"
      id: normalize
      shell: bash
      run: printf 'path=%s\n' "dist/report.json" >> "$GITHUB_OUTPUT"
```

Ba mắt xích phải khớp chính xác:

1. Step tạo output có `id`, ở đây là `normalize`.
2. Step ghi output tên `path` vào `$GITHUB_OUTPUT`.
3. `outputs.normalized-path.value` đọc `${{ steps.normalize.outputs.path }}`.

Thiếu một mắt xích thường không gây lỗi YAML; caller chỉ nhận chuỗi rỗng. Vì vậy, integration test phải assertion giá trị output chứ không chỉ kiểm tra step có màu xanh.

### Giới hạn và cách đọc output

GitHub giới hạn output tối đa **1 MB mỗi job** và tổng **50 MB mỗi workflow run**. Kích thước được ước lượng theo UTF-16. Dùng artifact, cache hoặc file trong workspace cho binary, báo cáo lớn và dữ liệu nhiều dòng; output chỉ nên mang ID, URL, số đếm hoặc JSON nhỏ.

Caller phải đặt `id` cho step dùng action:

```yaml
- name: "Chuẩn hóa"
  id: normalize
  uses: OWNER/normalize-action@v2
  with:
    target-path: "dist/report.json"

- name: "Dùng output"
  shell: bash
  env:
    NORMALIZED_PATH: ${{ steps.normalize.outputs.normalized-path }}
  run: printf 'Path: %s\n' "$NORMALIZED_PATH"
```

Chuyển output qua `env` thay vì chèn trực tiếp expression vào `run` giúp dữ liệu không tham gia giai đoạn sinh shell script.

## Cấu hình runs cho JavaScript action

### Runtime và entrypoint chính

Schema JavaScript hiện hành yêu cầu:

```yaml
runs:
  using: "node24"
  main: "dist/main.cjs"
```

`runs.using` hiện hỗ trợ `node20` và `node24`. Không dùng `node12` hoặc `node16` chỉ vì một JSON schema của editor cũ vẫn chấp nhận chúng. Khi nâng runtime, hãy kiểm tra metadata reference và phiên bản runner/GitHub Enterprise Server thực tế.

`main` là đường dẫn tương đối từ thư mục chứa metadata đến file JavaScript được runtime chạy. Runner không tự chạy `npm install` hoặc build source. Vì vậy, action dùng dependency phải commit bundle `dist/` và trỏ `main` đến bundle đó.

`runs.using` chọn runtime của **chính action**. Một step `actions/setup-node` trong workflow không thay đổi runtime mà runner đã chọn để khởi động action.

### Script pre và post

JavaScript action có thể khai báo lifecycle:

```yaml
runs:
  using: "node24"
  pre: "dist/pre.cjs"
  pre-if: runner.os == 'Linux'
  main: "dist/main.cjs"
  post: "dist/post.cjs"
  post-if: always()
```

| Thuộc tính | Bắt buộc | Vai trò |
|---|---:|---|
| `pre` | Không | Script chạy ở đầu job trước `main`, bằng cùng Node runtime |
| `pre-if` | Không | Điều kiện chạy `pre`; mặc định `always()` |
| `post` | Không | Script dọn dẹp ở cuối job sau `main`, bằng cùng Node runtime |
| `post-if` | Không | Điều kiện chạy `post`; mặc định `always()` |

Status function trong `pre-if` và `post-if` được đánh giá theo trạng thái của **job**, không phải một trạng thái riêng của action. Context `steps` không có trong `pre-if` vì chưa có step nào chạy.

<Callout type="warn" title="pre không chạy với local action">
  GitHub không hỗ trợ `runs.pre` cho action được gọi bằng local path như `uses: ./path`. Muốn kiểm thử đầy đủ `pre`, hãy push action và gọi bằng `OWNER/REPOSITORY/path@REF`. Đừng kết luận lifecycle đúng chỉ từ bài test local.
</Callout>

## Cấu hình runs cho Docker container action

### Image và nền tảng chạy

Docker action luôn dùng:

```yaml
runs:
  using: "docker"
  image: "Dockerfile"
```

`image` nhận một trong hai dạng chính:

- `Dockerfile` hoặc đường dẫn tương đối đến một file tên `Dockerfile` trong repository action;
- URI image public như `docker://debian:bookworm-slim`.

Với `image: Dockerfile`, GitHub build image từ source ở ref đang được gọi. Với `docker://...`, runner kéo image public đã công bố. Pin tag hoặc digest ổn định; không dùng `latest` cho production.

Docker container action chỉ chạy trên runner Linux. Self-hosted runner phải dùng Linux và có Docker. Nếu action cần chạy native trên Windows hoặc macOS, chọn JavaScript hoặc composite action phù hợp hơn.

### Entrypoint args và env

Các thuộc tính Docker thường dùng:

| Thuộc tính | Bắt buộc | Ý nghĩa |
|---|---:|---|
| `image` | Có | Dockerfile local hoặc public image URI |
| `entrypoint` | Không | Đặt hoặc ghi đè `ENTRYPOINT` trong Dockerfile |
| `args` | Không | Mảng chuỗi truyền cho entrypoint; thay thế `CMD` của Dockerfile |
| `env` | Không | Map biến môi trường đặt trong container |

Ví dụ:

```yaml
runs:
  using: "docker"
  image: "Dockerfile"
  entrypoint: "/entrypoint.sh"
  env:
    REPORT_FORMAT_VERSION: "2"
  args:
    - ${{ inputs.target-path }}
    - ${{ inputs.format }}
```

`runs.args` là vị trí chính thức để đưa input vào Docker action. Các phần tử được truyền như argument cho `ENTRYPOINT`; chúng không tự trải qua shell expansion. Đây là hành vi tốt cho an toàn: entrypoint script đọc `"$1"`, `"$2"` và validate từng giá trị.

Nếu `entrypoint` hoặc Dockerfile dùng exec form, chuỗi như `$GITHUB_SHA` trong `args` không tự được thay bằng biến môi trường. Chỉ shell mới thực hiện substitution. Đừng chuyển sang `sh -c` chỉ để “làm expression chạy”, vì input không tin cậy có thể trở thành shell code. Một wrapper script nhận positional arguments và quote `"$@"` là lựa chọn an toàn hơn.

### Lifecycle của container

Docker action còn hỗ trợ:

```yaml
runs:
  using: "docker"
  image: "Dockerfile"
  pre-entrypoint: "/prepare.sh"
  pre-if: runner.os == 'Linux'
  entrypoint: "/entrypoint.sh"
  post-entrypoint: "/cleanup.sh"
  post-if: always()
```

`pre-entrypoint` và `post-entrypoint` chạy trong **container mới** dùng cùng base image, không phải cùng container với entrypoint chính. Trạng thái chỉ nằm trong RAM hoặc filesystem riêng của container trước sẽ không còn. Dữ liệu cần chia sẻ phải đi qua workspace, `HOME` hoặc cơ chế state mà runner cung cấp.

Cả hai lifecycle hook mặc định chạy với `always()` nếu không có điều kiện tương ứng. Chỉ thêm chúng khi action thật sự cần chuẩn bị hoặc dọn tài nguyên; mỗi container bổ sung làm action chậm hơn và tăng bề mặt lỗi.

## Cấu hình runs cho composite action

### Các thuộc tính của step nội bộ

Composite action yêu cầu `using: composite` và mảng `steps`:

```yaml
runs:
  using: "composite"
  steps:
    - name: "Chạy lệnh"
      id: build
      shell: bash
      env:
        TARGET: ${{ inputs.target }}
      working-directory: ${{ github.workspace }}
      run: printf 'result=%s\n' "$TARGET" >> "$GITHUB_OUTPUT"

    - name: "Gọi action khác"
      if: inputs.upload == 'true'
      uses: OWNER/ANOTHER-ACTION@FULL_COMMIT_SHA
      with:
        path: ${{ steps.build.outputs.result }}
      continue-on-error: false
```

Schema hiện hành hỗ trợ các thuộc tính step sau:

| Thuộc tính | Áp dụng | Ghi chú |
|---|---|---|
| `name` | Cả hai | Tên hiển thị của step nội bộ |
| `id` | Cả hai | ID để tham chiếu qua context `steps` |
| `if` | Cả hai | Điều kiện chạy step |
| `run` | Run step | Lệnh inline hoặc gọi script đi kèm action |
| `shell` | Run step | Bắt buộc khi có `run` |
| `working-directory` | Run step | Thư mục thực thi lệnh |
| `uses` | Uses step | Action khác hoặc Docker image được gọi |
| `with` | Uses step | Input truyền cho action con |
| `env` | Step | Map biến chỉ có trong step đó |
| `continue-on-error` | Step | Cho phép composite tiếp tục khi step này lỗi |

Một step phải là run step hoặc uses step. Đừng đặt cả `run` và `uses` trong cùng một item. Composite metadata không có `runs-on`, `services`, `strategy`, `permissions` hay top-level `env`; các thuộc tính cấp job vẫn do caller sở hữu.

### Shell đường dẫn và môi trường

Mọi run step phải khai báo `shell`. Chọn `bash`, `pwsh`, `python` hoặc custom shell chỉ khi executable đó tồn tại trên runner mà action tuyên bố hỗ trợ.

Dùng `${{ github.action_path }}` hoặc biến `$GITHUB_ACTION_PATH` để tìm script được đóng gói cùng action:

```yaml
- name: "Chạy script của action"
  shell: bash
  env:
    SCRIPT_PATH: ${{ github.action_path }}/scripts/check.sh
  run: bash "$SCRIPT_PATH"
```

`GITHUB_WORKSPACE` là source của repository caller; nó không phải thư mục action remote. Nhầm hai path này là nguyên nhân phổ biến khiến `uses: ./...` chạy đúng nhưng action phát hành lại báo thiếu file.

`runs.steps[*].env` chỉ tồn tại trong step đó. Muốn truyền biến sang step tiếp theo của cùng job, ghi `NAME=value` vào `$GITHUB_ENV`. Muốn tạo output, ghi vào `$GITHUB_OUTPUT`. Các file môi trường ảnh hưởng job của caller, nên dùng prefix riêng và không ghi đè biến chung ngoài ý muốn.

## Expressions trong action metadata

Expression là biểu thức `${{ ... }}` được GitHub đánh giá trước hoặc trong quá trình điều phối step. Không phải mọi chuỗi trong metadata đều hỗ trợ expression.

### Vị trí hỗ trợ expression

Các vị trí quan trọng được metadata reference mô tả hoặc minh họa gồm:

| Vị trí | Mục đích | Ví dụ |
|---|---|---|
| `outputs.<id>.value` của composite | Ánh xạ output step nội bộ | `${{ steps.build.outputs.result }}` |
| `runs.pre-if`, `runs.post-if` | Điều kiện lifecycle JavaScript/Docker | `runner.os == 'Linux'` |
| `runs.args` của Docker | Truyền input/context thành argument | `${{ inputs.target-path }}` |
| `runs.steps[*].if` của composite | Điều kiện step | `inputs.verbose == 'true'` |
| `runs.steps[*].run`, `env`, `with` của composite | Dùng context trong step | `${{ inputs.target }}` |
| `runs.steps[*].working-directory` | Chọn thư mục từ context | `${{ github.workspace }}` |

Các trường cấu trúc như `name`, `description`, `author`, ID input/output, `branding`, `runs.using`, `runs.main`, `runs.image` và `runs.entrypoint` nên được xem là metadata tĩnh. `inputs.<id>.default` cũng là một string mặc định, không phải nơi lấy secret hay giá trị runtime từ caller.

Nếu cần giá trị động, caller truyền nó qua `with`, rồi action đọc qua `inputs`. Không cố xây tên input, đường dẫn entrypoint hoặc `using` bằng expression.

### Cú pháp và giới hạn quan trọng

- Dùng `${{ expression }}` ở vị trí giá trị được hỗ trợ. Riêng các khóa điều kiện như `if`, `pre-if`, `post-if` có thể bỏ cặp `${{ }}`.
- Nếu điều kiện bắt đầu bằng `!`, phải bọc bằng `${{ }}` hoặc quote/đặt ngoặc vì `!` là cú pháp tag của YAML: `if: ${{ !cancelled() }}`.
- Trong expression, string đặt trong dấu nháy đơn. Một dấu nháy đơn bên trong string được escape bằng hai dấu nháy đơn: `${{ 'It''s valid' }}`. Dấu nháy kép bên trong `${{ }}` gây lỗi cú pháp expression.
- Output của step được đánh giá như string. Dùng `fromJSON()` nếu thật sự cần so sánh số hoặc boolean.
- So sánh string của GitHub không phân biệt hoa thường và equality có coercion kiểu. Đừng dựa vào coercion cho validation; parse trong code rõ ràng hơn.
- `pre-if` không dùng được context `steps`, vì chưa có step nào chạy.
- Context khả dụng phụ thuộc vị trí. Một context hợp lệ trong composite step chưa chắc hợp lệ trong lifecycle condition.
- Expression được thay trước khi shell chạy. Không chèn input không tin cậy trực tiếp vào `run`; chuyển qua `env`, quote biến và validate.

Mẫu nguy hiểm:

```yaml
run: echo "${{ inputs.message }}"
```

Mẫu an toàn hơn:

```yaml
env:
  MESSAGE: ${{ inputs.message }}
run: printf '%s\n' "$MESSAGE"
```

`env` ngăn input tham gia lúc GitHub sinh script, nhưng không tự làm dữ liệu an toàn. Code vẫn phải quote biến, tránh `eval` và dùng allowlist khi giá trị điều khiển lệnh hoặc path.

## Ba ví dụ metadata hoàn chỉnh

Mỗi ví dụ dưới đây là một action độc lập trong thư mục riêng. Không đặt cả ba file metadata vào cùng một thư mục.

### Ví dụ JavaScript action

`action.yml`:

```yaml
name: "Normalize text with Node"
description: "Chuẩn hóa một chuỗi một dòng và công bố kết quả"
author: "Platform Engineering"

inputs:
  text:
    description: "Chuỗi một dòng cần chuẩn hóa"
    required: true
  trim:
    description: "Xóa khoảng trắng ở hai đầu"
    required: false
    default: "true"
  old-trim-mode:
    description: "Cờ trim cũ để tương thích tạm thời"
    required: false
    deprecationMessage: "old-trim-mode sẽ bị xóa ở v2; hãy dùng trim."

outputs:
  normalized:
    description: "Chuỗi sau khi chuẩn hóa"

runs:
  using: "node24"
  pre: "dist/pre.cjs"
  pre-if: runner.os == 'Linux'
  main: "dist/main.cjs"
  post: "dist/post.cjs"
  post-if: always()

branding:
  icon: "type"
  color: "blue"
```

Ba file được metadata tham chiếu phải tồn tại. Ví dụ tối thiểu không dùng dependency ngoài:

```js title="dist/pre.cjs"
'use strict'

console.log('Preparing normalize action')
```

```js title="dist/main.cjs"
'use strict'

const { appendFileSync } = require('node:fs')

const raw = process.env.INPUT_TEXT ?? ''
const trimInput = (process.env.INPUT_TRIM ?? 'true').toLowerCase()
const outputFile = process.env.GITHUB_OUTPUT

if (!raw || /[\r\n]/.test(raw)) {
  console.error("::error::Input 'text' phải là chuỗi một dòng không rỗng.")
  process.exitCode = 1
} else if (!['true', 'false'].includes(trimInput)) {
  console.error("::error::Input 'trim' chỉ nhận true hoặc false.")
  process.exitCode = 1
} else if (!outputFile) {
  console.error('::error::Không tìm thấy GITHUB_OUTPUT.')
  process.exitCode = 1
} else {
  const normalized = trimInput === 'true' ? raw.trim() : raw
  appendFileSync(outputFile, `normalized=${normalized}\n`, 'utf8')
  console.log(`Normalized ${raw.length} characters.`)
}
```

```js title="dist/post.cjs"
'use strict'

console.log('Normalize action cleanup completed')
```

Trong action thực tế dùng npm dependency, `dist/main.cjs` nên là bundle sinh từ source và lockfile, không phải file sửa tay. Ví dụ này giữ code nhỏ để tập trung vào metadata và có thể chạy ngay.

### Ví dụ Docker container action

`action.yml`:

```yaml
name: "File size report"
description: "Đo kích thước một file trong workspace bằng container"
author: "Platform Engineering"

inputs:
  path:
    description: "Đường dẫn tương đối của file trong workspace"
    required: true
  label:
    description: "Nhãn một dòng cho log"
    required: false
    default: "file-size"
  old-path:
    description: "Tên input path cũ"
    required: false
    deprecationMessage: "old-path sẽ bị xóa ở v2; hãy dùng path."

outputs:
  bytes:
    description: "Kích thước file theo byte"

runs:
  using: "docker"
  image: "Dockerfile"
  entrypoint: "/entrypoint.sh"
  env:
    REPORT_SCHEMA: "1"
  args:
    - ${{ inputs.path }}
    - ${{ inputs.label }}

branding:
  icon: "hard-drive"
  color: "purple"
```

`Dockerfile`:

```dockerfile
FROM alpine:3.21

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

`entrypoint.sh`:

```sh
#!/bin/sh
set -eu

target=${1:-}
label=${2:-file-size}

case "$target" in
  ""|/*|../*|*/../*|*/..)
    echo "::error::Input 'path' phải là đường dẫn tương đối không chứa '..'."
    exit 1
    ;;
esac

file="$GITHUB_WORKSPACE/$target"
if [ ! -f "$file" ]; then
  echo "::error::Không tìm thấy file: $target"
  exit 1
fi

bytes=$(wc -c < "$file" | tr -d ' ')
printf 'bytes=%s\n' "$bytes" >> "$GITHUB_OUTPUT"
printf '[schema=%s] %s: %s bytes\n' "$REPORT_SCHEMA" "$label" "$bytes"
```

`args` truyền input theo đúng thứ tự `$1`, `$2`. Script quote mọi biến, từ chối path tuyệt đối/path traversal và ghi output vào environment file. Image Alpine không chứa công cụ ngoài cần cài thêm.

### Ví dụ composite action

`action.yml` sau tự chạy bằng Bash, không cần file phụ:

```yaml
name: "Create safe slug"
description: "Chuẩn hóa nhãn ASCII thành slug cho step sau"
author: "Platform Engineering"

inputs:
  text:
    description: "Nhãn ASCII cần chuẩn hóa"
    required: true
  casing:
    description: "Kiểu chữ: lower hoặc upper"
    required: false
    default: "lower"
  verbose:
    description: "In thêm log không nhạy cảm"
    required: false
    default: "false"
  legacy-prefix:
    description: "Prefix cũ không còn được khuyến nghị"
    required: false
    deprecationMessage: "legacy-prefix sẽ bị xóa ở v2; hãy ghép prefix ở caller."

outputs:
  slug:
    description: "Slug chỉ gồm chữ ASCII, số và dấu gạch nối"
    value: ${{ steps.build.outputs.slug }}

runs:
  using: "composite"
  steps:
    - name: "Validate and build slug"
      id: build
      shell: bash
      env:
        INPUT_TEXT: ${{ inputs.text }}
        INPUT_CASING: ${{ inputs.casing }}
      run: |
        set -euo pipefail

        if [[ -z "$INPUT_TEXT" || "$INPUT_TEXT" == *$'\n'* ]]; then
          echo "::error::Input 'text' phải là chuỗi một dòng không rỗng."
          exit 1
        fi

        case "$INPUT_CASING" in
          lower|upper) ;;
          *)
            echo "::error::Input 'casing' chỉ nhận lower hoặc upper."
            exit 1
            ;;
        esac

        slug=$(printf '%s' "$INPUT_TEXT" \
          | LC_ALL=C tr '[:upper:]' '[:lower:]' \
          | LC_ALL=C tr -cs '[:alnum:]' '-' \
          | sed 's/^-//; s/-$//')

        if [[ -z "$slug" ]]; then
          echo "::error::Không tạo được slug hợp lệ."
          exit 1
        fi

        if [[ "$INPUT_CASING" == "upper" ]]; then
          slug=$(printf '%s' "$slug" | LC_ALL=C tr '[:lower:]' '[:upper:]')
        fi

        printf 'slug=%s\n' "$slug" >> "$GITHUB_OUTPUT"

    - name: "Log result"
      if: inputs.verbose == 'true'
      shell: bash
      env:
        SLUG: ${{ steps.build.outputs.slug }}
      run: printf 'Created slug: %s\n' "$SLUG"

branding:
  icon: "tag"
  color: "green"
```

`value` ánh xạ output công khai `slug` đến output của step `build`. Input đi qua `env`, không được chèn thẳng vào shell script. Action này hỗ trợ runner có Bash và các tiện ích POSIX đã dùng; metadata không tự biến nó thành action đa nền tảng.

## Validation metadata

Validation cần kiểm tra ba lớp khác nhau: YAML có parse được không, cấu trúc có khớp loại action không, và các file/giá trị runtime có thật sự chạy trên GitHub không.

### Kiểm tra tĩnh tại máy phát triển

Thực hiện từ thư mục chứa action:

```bash
# Bắt lỗi whitespace và conflict marker trong nội dung Git theo dõi.
git diff --check

# Parse và kiểm tra format YAML. Prettier trả lỗi nếu YAML hỏng.
npx --yes prettier@3 --check action.yml

# JavaScript action: entrypoint có tồn tại và parse được không?
test -f dist/main.cjs
node --check dist/main.cjs

# Docker action: image local có build được không?
docker build -t local/file-size-action:test .
```

Sau đó review thủ công các invariant mà formatter không biết:

- chỉ có `name`, `description`, `runs` là ba khóa bắt buộc cấp cao;
- `runs` chỉ khớp một trong ba loại;
- mọi path ở `main`, `pre`, `post`, `image`, `entrypoint` tồn tại tại đúng ref;
- mọi input/output ID đúng mẫu và khớp code;
- composite output trỏ đến step ID/output có thật;
- mọi composite run step có `shell`;
- `node20` hoặc `node24` khớp runner/GHES mục tiêu.

Bạn có thể gắn schema cộng đồng của SchemaStore cho editor:

```yaml
# yaml-language-server: $schema=https://json.schemastore.org/github-action.json
```

<Callout type="warn" title="Schema editor không phải nguồn chuẩn cuối cùng">
  JSON schema cộng đồng có thể cập nhật chậm hơn GitHub. Tại thời điểm biên soạn, có schema vẫn chấp nhận Node runtime đã cũ trong khi metadata reference hiện hành chỉ liệt kê `node20` và `node24`. Dùng schema để bắt typo, nhưng dùng tài liệu chính thức và GitHub runner để quyết định tính hỗ trợ.
</Callout>

### Kiểm tra bằng GitHub runner

Cách kiểm tra có thẩm quyền nhất là tạo workflow consumer gọi action. Nó phát hiện các lỗi mà parser local không thấy: khóa không được hỗ trợ, path sai sau checkout, runtime không có trên runner, output mapping rỗng và Docker action chạy sai nền tảng.

Với local action, workflow phải checkout repository trước:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
- uses: ./.github/actions/my-action
```

Test cả ca thành công và ca lỗi. Ca thành công phải assertion output cụ thể. Ca lỗi phải chứng minh input rỗng, enum sai hoặc path traversal bị từ chối với thông báo dễ hiểu.

Nhớ rằng local test không chạy `runs.pre` của JavaScript action. Một test consumer dùng `OWNER/REPOSITORY/path@BRANCH_OR_SHA` là cần thiết nếu action phụ thuộc vào pre lifecycle.

## Bài thực hành và kiểm chứng

### Chuẩn bị ba action

Tạo cấu trúc sau trong một repository thử nghiệm:

```text
.github/
├── actions/
│   ├── js-normalize/
│   │   ├── action.yml
│   │   └── dist/
│   │       ├── pre.cjs
│   │       ├── main.cjs
│   │       └── post.cjs
│   ├── file-size/
│   │   ├── action.yml
│   │   ├── Dockerfile
│   │   └── entrypoint.sh
│   └── safe-slug/
│       └── action.yml
└── workflows/
    └── test-action-metadata.yml
```

Sao chép ba ví dụ vào đúng thư mục. Cho script Docker quyền execute trong Git index:

```bash
git add .github/actions/file-size/entrypoint.sh
git update-index --chmod=+x .github/actions/file-size/entrypoint.sh
```

Chạy các kiểm tra tĩnh cho từng thư mục trước khi push.

### Workflow gọi action local

Tạo `.github/workflows/test-action-metadata.yml`:

```yaml
name: "Test action metadata"

on:
  push:
    paths:
      - ".github/actions/**"
      - ".github/workflows/test-action-metadata.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  metadata-contract:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: "Checkout repository"
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: "Run JavaScript action"
        id: js
        uses: ./.github/actions/js-normalize
        with:
          text: "  Metadata Demo  "
          trim: "true"

      - name: "Run Docker action"
        id: docker
        uses: ./.github/actions/file-size
        with:
          path: ".github/actions/file-size/action.yml"
          label: "docker-action-metadata"

      - name: "Run composite action"
        id: composite
        uses: ./.github/actions/safe-slug
        with:
          text: "Metadata Demo"
          casing: "lower"
          verbose: "true"

      - name: "Assert outputs"
        shell: bash
        env:
          JS_VALUE: ${{ steps.js.outputs.normalized }}
          FILE_BYTES: ${{ steps.docker.outputs.bytes }}
          SLUG: ${{ steps.composite.outputs.slug }}
        run: |
          set -euo pipefail
          [[ "$JS_VALUE" == "Metadata Demo" ]]
          [[ "$FILE_BYTES" =~ ^[1-9][0-9]*$ ]]
          [[ "$SLUG" == "metadata-demo" ]]
          printf 'All metadata contracts passed.\n'
```

Workflow dùng Ubuntu vì Docker action cần Linux và composite example cần Bash. Nó chỉ cấp `contents: read`; custom action không thể tự khai báo thêm `permissions` trong metadata.

### Tiêu chí kiểm chứng

| Kiểm tra | Kết quả mong đợi |
|---|---|
| YAML/schema cơ bản | Runner nạp cả ba `action.yml` mà không báo khóa lạ hoặc thiếu khóa bắt buộc |
| JavaScript runtime | `dist/main.cjs` chạy bằng Node 24 và output là `Metadata Demo` |
| Local lifecycle | `main` và `post` chạy; không kỳ vọng `pre` chạy vì đây là local action |
| Docker mapping | `path` và `label` đến đúng `$1`, `$2`; output `bytes` là số dương |
| Composite mapping | `steps.build.outputs.slug` được công bố thành `metadata-demo` |
| Expression | `if: inputs.verbose == 'true'` làm step log xuất hiện |
| Validation runtime | Thử `casing: "mixed"` phải làm composite action thất bại rõ ràng |
| Path validation | Thử Docker input `path: "../secret"` phải bị từ chối |
| Output contract | Step assertion thất bại nếu đổi sai output ID hoặc step ID |
| Quyền | Workflow chỉ cần `contents: read` cho checkout |

Sau khi test local pass, push action lên branch và gọi JavaScript action bằng remote ref để xác minh `pre`. Trước release, chạy lại bằng tag hoặc full commit SHA dự kiến công bố.

## Checklist review

- [ ] File tên `action.yml` hoặc `action.yaml`, nằm đúng thư mục mà `uses` trỏ đến.
- [ ] Không có khóa workflow như `on`, `jobs`, `runs-on`, `permissions` trong metadata.
- [ ] `name`, `description`, `runs` tồn tại và là giá trị tĩnh dễ hiểu.
- [ ] `author` và `branding` dùng giá trị hợp lệ; icon đã đối chiếu danh sách GitHub hỗ trợ.
- [ ] Mỗi input có `description`; ID chữ thường, duy nhất và đúng mẫu.
- [ ] `required` là boolean; `default` là string đã quote nếu trông giống số/boolean.
- [ ] Code vẫn tự validation mọi input bắt buộc, enum, độ dài và path.
- [ ] Input deprecated có `deprecationMessage`, phương án thay thế và kế hoạch xóa.
- [ ] Mỗi output công khai có `description` và tên khớp code/caller.
- [ ] Composite output có `value` trỏ đến step ID và output nội bộ có thật.
- [ ] Output nhỏ; dữ liệu lớn chuyển sang artifact hoặc file.
- [ ] JavaScript chỉ dùng runtime hiện hành và mọi `main`, `pre`, `post` đã build/commit.
- [ ] Nếu dùng `pre`, đã test bằng remote ref thay vì chỉ `uses: ./...`.
- [ ] Docker `image` được pin hợp lý; entrypoint executable; `args` đúng thứ tự.
- [ ] Docker input được quote và validate; không dùng `sh -c` với dữ liệu không tin cậy.
- [ ] Docker lifecycle không giả định ba container chia sẻ trạng thái RAM/filesystem riêng.
- [ ] Mọi composite run step có `shell`; script đi kèm dùng `github.action_path`.
- [ ] Mọi action con trong composite được pin bằng full commit SHA khi dùng production.
- [ ] Expression chỉ nằm ở khóa hỗ trợ và không chèn input không tin cậy trực tiếp vào `run`.
- [ ] CI parse YAML, kiểm tra file tham chiếu, build/test implementation và assertion output trên GitHub runner.
- [ ] README mô tả inputs, outputs, quyền cần thiết, runner hỗ trợ và ví dụ caller.

## Best practices

- **Xem metadata là public API.** Đổi tên input/output, default hoặc định dạng output có thể là breaking change dù implementation chỉ sửa vài dòng.
- **Giữ interface nhỏ.** Một action có quá nhiều cờ boolean thường đang làm nhiều trách nhiệm. Tách action hoặc dùng enum rõ ràng.
- **Mô tả định dạng, không chỉ đặt tên.** Ghi đơn vị, enum, path base và ví dụ trong `description`/README.
- **Validate trong runtime.** Metadata mô tả hợp đồng; code thực thi hợp đồng.
- **Dùng default bảo thủ.** Default không nên tự cấp quyền ghi, publish hoặc xóa dữ liệu.
- **Deprecate trước khi xóa.** Thêm warning, hỗ trợ song song trong một chu kỳ và xóa ở major release.
- **Khai báo output đầy đủ.** Dù JavaScript/Docker có thể tạo output chưa khai báo, interface ẩn rất khó duy trì.
- **Bundle JavaScript xác định được.** Commit lockfile và bundle; CI build lại rồi chặn diff ở `dist/`.
- **Pin image và action con.** Full SHA/digest là bất biến; tag major thuận tiện nhưng có thể di chuyển.
- **Truyền dữ liệu như dữ liệu.** Dùng `env` hoặc positional args, quote biến và không dùng `eval`.
- **Giữ quyền ở caller.** Metadata action không có `permissions`; README phải nói chính xác caller cần scope nào.
- **Test trên nền tảng đã cam kết.** Docker là Linux-only; composite phụ thuộc shell; JavaScript có thể vướng path hoặc binary theo hệ điều hành.
- **Không đổi tên metadata giữa release.** Giữ ổn định `action.yml` để không làm ẩn release Marketplace cũ.
- **Đối chiếu reference khi nâng runtime.** GitHub.com, GHES và self-hosted runner có thể không cùng nhịp hỗ trợ Node runtime mới.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Can't find action.yml, action.yaml or Dockerfile` | `uses` trỏ sai thư mục, trỏ thẳng vào file hoặc chưa checkout local action | Checkout repository, rồi trỏ `uses` đến thư mục chứa metadata |
| `Required property is missing: name/description/runs` | Thiếu khóa cấp cao hoặc thụt lề làm khóa rơi vào map khác | Sửa YAML và chạy formatter/parser trước khi push |
| `Unexpected value 'main'` trong composite | Trộn schema JavaScript vào `using: composite` | Dùng `steps`; chỉ JavaScript action có `main` |
| Runtime `node16` bị từ chối/deprecated | Schema/editor cũ hoặc metadata chưa nâng runtime | Đối chiếu reference hiện hành, đổi sang runtime hỗ trợ và build lại bundle |
| `Cannot find ... dist/main.cjs` | `main` sai path hoặc bundle không có tại ref được gọi | Build, commit `dist/`, kiểm tra chữ hoa/thường và test đúng ref |
| JavaScript `pre` không chạy | Action được gọi bằng local path | Test bằng `OWNER/REPOSITORY/path@REF`; local action không hỗ trợ `runs.pre` |
| `post` không chạy như kỳ vọng | `post-if` sai hoặc job bị hủy theo cách không cho cleanup hoàn tất | Kiểm tra condition/status function; thiết kế cleanup idempotent và không phụ thuộc duy nhất vào post |
| Docker action lỗi trên Windows/macOS | Docker container action chỉ hỗ trợ runner Linux | Chạy job trên Linux hoặc đổi loại action |
| Docker nhận literal `$GITHUB_SHA` | Exec-form entrypoint không chạy shell substitution | Đọc biến trong script entrypoint; không kỳ vọng substitution trong `args` |
| Docker không nhận input | Input chưa được đưa vào `runs.args` hoặc thứ tự `$1`, `$2` sai | Ánh xạ từng input trong `args` và test positional arguments |
| Docker script báo `permission denied` | Entrypoint không có execute bit trong image/Git index | `chmod +x`, commit file mode hoặc `RUN chmod +x` trong Dockerfile |
| Dữ liệu từ pre container mất ở main | Lifecycle hook chạy trong container mới | Lưu trạng thái qua workspace, `HOME` hoặc state của runner |
| Composite báo thiếu `shell` | Run step không khai báo shell | Thêm `shell` vào mọi item có `run` |
| Composite không có `INPUT_*` | Composite không tự tạo biến input | Dùng `${{ inputs.id }}` và ánh xạ qua `env` |
| Script của composite không tìm thấy | Dùng path từ workspace thay vì thư mục action | Dùng `${{ github.action_path }}` hoặc `$GITHUB_ACTION_PATH` |
| Output composite rỗng | Sai step `id`, sai tên ghi vào `$GITHUB_OUTPUT` hoặc thiếu `outputs.<id>.value` | Kiểm tra đủ ba mắt xích và thêm assertion ở caller |
| Input `required: true` vẫn rỗng | GitHub không tự fail action khi thiếu input | Validation ngay đầu implementation và thông báo lỗi cụ thể |
| Warning deprecation không xuất hiện | Caller không truyền input cũ hoặc sai casing `deprecationMessage` | Kiểm tra caller và dùng đúng khóa camelCase |
| `Unrecognized named-value: 'steps'` trong `pre-if` | Context `steps` chưa tồn tại trước job lifecycle | Chỉ dùng context có sẵn như `runner` trong `pre-if` |
| YAML lỗi khi condition bắt đầu bằng `!` | YAML hiểu `!` là tag | Dùng `if: ${{ !cancelled() }}` hoặc quote/đặt ngoặc đúng |
| Output vượt giới hạn | Đưa báo cáo/file lớn vào output | Chuyển sang artifact, cache hoặc file trong workspace |
| Branding không hiện đúng | Color/icon không nằm trong allowlist hoặc action chưa được niêm yết | Chọn color hợp lệ và đối chiếu danh sách icon trong reference |

## Nguồn chính thức

- [Metadata syntax reference](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)
- [Evaluate expressions in workflows and actions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)
- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [Workflow commands và cách đặt output](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- [Dockerfile support for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/dockerfile-support)
- [Creating a JavaScript action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-javascript-action)
- [Creating a Docker container action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-docker-container-action)
- [Creating a composite action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-composite-action)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)

## Bài liên quan

<Cards>
  <Card title="Composite actions" href="/docs/tai-su-dung-actions/03-composite-actions/" description="Đóng gói chuỗi step thành một action tái sử dụng." />
  <Card title="JavaScript actions" href="/docs/tai-su-dung-actions/04-javascript-actions/" description="Viết, bundle, kiểm thử và phát hành JavaScript action." />
  <Card title="Docker container actions" href="/docs/tai-su-dung-actions/05-docker-container-actions/" description="Đóng gói toolchain và entrypoint trong container Linux." />
  <Card title="Phát hành và version actions" href="/docs/tai-su-dung-actions/07-publish-version-actions/" description="Quản lý tag, release và thay đổi interface an toàn." />
</Cards>
