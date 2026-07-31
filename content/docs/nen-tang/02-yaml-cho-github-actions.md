---
title: "YAML cho GitHub Actions"
description: "Nắm cú pháp YAML, kiểu dữ liệu, chuỗi nhiều dòng, expression và các lỗi thường gặp khi viết workflow GitHub Actions."
---

<Callout type="info" title="Bạn sẽ làm được gì?">
  Sau bài này, bạn có thể đọc cấu trúc YAML theo mapping, sequence và scalar; chọn cách quote chuỗi an toàn; dùng `|`, `>` và expression đúng ngữ cảnh; đồng thời tự chẩn đoán lỗi parse phổ biến. Cuối bài, bạn sẽ tạo một workflow độc lập, chạy được mà không cần dự án mẫu hay dependency.
</Callout>

## Mục lục

- [YAML đóng vai trò gì trong GitHub Actions](#yaml-đóng-vai-trò-gì-trong-github-actions)
- [Ba thành phần nền tảng](#ba-thành-phần-nền-tảng)
  - [Mapping: tập hợp khóa và giá trị](#mapping-tập-hợp-khóa-và-giá-trị)
  - [Sequence: danh sách có thứ tự](#sequence-danh-sách-có-thứ-tự)
  - [Scalar: một giá trị đơn](#scalar-một-giá-trị-đơn)
- [Thụt lề quyết định cấu trúc](#thụt-lề-quyết-định-cấu-trúc)
  - [Dùng khoảng trắng, không dùng tab](#dùng-khoảng-trắng-không-dùng-tab)
  - [Đọc phạm vi từ trái sang phải](#đọc-phạm-vi-từ-trái-sang-phải)
- [Viết scalar an toàn](#viết-scalar-an-toàn)
  - [Chuỗi thường, nháy đơn và nháy kép](#chuỗi-thường-nháy-đơn-và-nháy-kép)
  - [Block scalar với dấu thẳng đứng và dấu lớn hơn](#block-scalar-với-dấu-thẳng-đứng-và-dấu-lớn-hơn)
  - [Bẫy boolean, null và number](#bẫy-boolean-null-và-number)
  - [Comment không phải dữ liệu](#comment-không-phải-dữ-liệu)
- [Expression bên trong YAML](#expression-bên-trong-yaml)
  - [Hai lớp cú pháp được xử lý theo thứ tự](#hai-lớp-cú-pháp-được-xử-lý-theo-thứ-tự)
  - [Quote chuỗi trong expression](#quote-chuỗi-trong-expression)
  - [Khóa on và parser YAML 1.1](#khóa-on-và-parser-yaml-11)
- [Workflow hoàn chỉnh](#workflow-hoàn-chỉnh)
  - [Tạo file workflow](#tạo-file-workflow)
  - [Đọc cấu trúc của workflow](#đọc-cấu-trúc-của-workflow)
- [Lỗi parse thường gặp](#lỗi-parse-thường-gặp)
  - [Thiếu dấu hai chấm sau khóa](#thiếu-dấu-hai-chấm-sau-khóa)
  - [Đặt sequence sai cấp](#đặt-sequence-sai-cấp)
  - [Chuỗi chứa dấu hai chấm và khoảng trắng nhưng không quote](#chuỗi-chứa-dấu-hai-chấm-và-khoảng-trắng-nhưng-không-quote)
  - [Glob bắt đầu bằng ký tự đặc biệt](#glob-bắt-đầu-bằng-ký-tự-đặc-biệt)
  - [Block scalar thụt lề không đều](#block-scalar-thụt-lề-không-đều)
  - [Trộn cú pháp YAML và schema GitHub](#trộn-cú-pháp-yaml-và-schema-github)
  - [Lặp khóa ở cùng cấp](#lặp-khóa-ở-cùng-cấp)
- [Bài thực hành](#bài-thực-hành)
  - [Yêu cầu và cách thực hiện](#yêu-cầu-và-cách-thực-hiện)
  - [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Bước tiếp theo](#bước-tiếp-theo)
- [Nguồn chính thức](#nguồn-chính-thức)

## YAML đóng vai trò gì trong GitHub Actions

YAML là ngôn ngữ tuần tự hóa dữ liệu, tức cách biểu diễn dữ liệu có cấu trúc bằng văn bản. Trong GitHub Actions, YAML mô tả **workflow**: sự kiện nào kích hoạt tự động hóa, có những job nào, mỗi job chạy trên runner nào và gồm những step nào.

GitHub chỉ tìm file workflow có phần mở rộng `.yml` hoặc `.yaml` trong thư mục `.github/workflows/`. Ví dụ:

```text
repository/
└── .github/
    └── workflows/
        └── yaml-lab.yml
```

Một file phải vượt qua hai lớp kiểm tra:

1. **YAML hợp lệ:** parser (bộ đọc cú pháp) phải chuyển được văn bản thành dữ liệu có cấu trúc.
2. **Workflow hợp lệ:** cấu trúc đó phải đúng schema của GitHub Actions. Schema là tập quy tắc cho biết khóa nào được phép xuất hiện và giá trị phải có kiểu gì.

Ví dụ, file dưới đây là YAML hợp lệ nhưng không phải workflow hợp lệ vì GitHub Actions không có khóa cấp cao nhất tên `server`:

```yaml
server:
  port: 8080
```

Ngược lại, `jobs.<job_id>.steps` là vị trí hợp lệ theo workflow schema:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo "YAML hợp lệ và đúng schema"
```

<Callout type="idea" title="Mô hình để chẩn đoán nhanh">
  Nếu GitHub không nhận file, hãy kiểm tra cú pháp YAML trước. Nếu GitHub nhận file nhưng báo `Unexpected value` hoặc `Required property is missing`, hãy kiểm tra schema và cấp thụt lề của khóa.
</Callout>

## Ba thành phần nền tảng

Mọi cấu trúc cần dùng trong workflow đều được ghép từ ba loại node: **mapping**, **sequence** và **scalar**. Node là một phần tử dữ liệu trong cây YAML.

### Mapping: tập hợp khóa và giá trị

Mapping tương đương object hoặc dictionary trong ngôn ngữ lập trình. Mỗi mục có dạng `khóa: giá trị`.

```yaml
name: YAML Lab
permissions:
  contents: read
```

Ở đây:

- `name` ánh xạ đến scalar `YAML Lab`;
- `permissions` ánh xạ đến một mapping con;
- trong mapping con, `contents` ánh xạ đến scalar `read`.

Các khóa cùng một mapping phải là duy nhất. Không khai báo hai khối `jobs:` hoặc hai khóa `runs-on:` ở cùng cấp. Parser có thể báo lỗi hoặc giữ một giá trị và làm mất giá trị còn lại.

### Sequence: danh sách có thứ tự

Sequence tương đương array hoặc list. Mỗi phần tử dạng block bắt đầu bằng dấu gạch ngang và một khoảng trắng, `- `.

```yaml
steps:
  - name: Bước thứ nhất
    run: echo "Một"

  - name: Bước thứ hai
    run: echo "Hai"
```

`steps` là sequence gồm hai mapping. Trong mỗi mapping, `name` và `run` thuộc cùng một step. GitHub chạy các step của một job theo thứ tự từ trên xuống dưới.

YAML cũng có cú pháp sequence dạng flow trên một dòng:

```yaml
on: [push, workflow_dispatch]
```

Dạng này ngắn, nhưng dạng block dễ review hơn khi danh sách dài hoặc mỗi phần tử có cấu hình con:

```yaml
on:
  push:
  workflow_dispatch:
```

### Scalar: một giá trị đơn

Scalar là một giá trị không chứa node con. Chuỗi, boolean, số và `null` đều là scalar.

```yaml
name: YAML Lab             # chuỗi
continue-on-error: false   # boolean
timeout-minutes: 5         # số
```

Kiểu dữ liệu phải phù hợp vị trí. `continue-on-error` cần boolean, còn `timeout-minutes` cần số. Giá trị dưới `env` được đưa vào môi trường của tiến trình dưới dạng chuỗi, vì vậy nên biểu đạt rõ ý định:

```yaml
env:
  FEATURE_ENABLED: "false"
  NODE_VERSION: "20"
```

## Thụt lề quyết định cấu trúc

YAML không dùng cặp ngoặc để bao phạm vi ở dạng block. Khoảng trắng đầu dòng cho biết node nào là cha và node nào là con.

### Dùng khoảng trắng, không dùng tab

Chọn hai khoảng trắng cho mỗi cấp và giữ nhất quán trong toàn repository. YAML không cho phép ký tự tab dùng làm thụt lề.

Đúng:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: echo "lint"
```

Sai vì `runs-on` và `steps` không nằm cùng cấp:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
      steps:
        - run: echo "lint"
```

Sai vì dòng `runs-on` bắt đầu bằng tab, dù editor có thể hiển thị tab giống nhiều khoảng trắng:

```text
jobs:
  lint:
→ runs-on: ubuntu-latest
```

Mũi tên trong ví dụ đại diện cho một ký tự tab. Hãy bật chế độ hiển thị whitespace trong editor để phát hiện ký tự ẩn này.

### Đọc phạm vi từ trái sang phải

Xét đoạn sau:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      MODE: "test"
    steps:
      - name: In chế độ
        run: echo "$MODE"
```

Có thể đọc cấu trúc theo đường dẫn:

```text
jobs
└── build
    ├── runs-on
    ├── env
    │   └── MODE
    └── steps
        └── phần tử 1
            ├── name
            └── run
```

`MODE` thuộc `env` của job `build`, nên mọi step trong job có thể đọc biến này. Nếu đưa `env` vào bên trong một phần tử của `steps`, biến chỉ có phạm vi ở step đó. Đây là hệ quả của cấu trúc workflow, không phải YAML tự tạo vòng đời cho biến.

<Callout type="warn" title="Dấu gạch ngang cũng tạo phạm vi">
  Sau `- name:`, các khóa `uses`, `with`, `env` hoặc `run` phải thẳng hàng với `name` nếu chúng thuộc cùng một step. Một step không được đồng thời có cả `uses` và `run`.
</Callout>

## Viết scalar an toàn

Scalar nhìn đơn giản nhưng là nguồn của nhiều lỗi khó thấy. Hãy chọn kiểu viết dựa trên ý nghĩa dữ liệu, không chỉ dựa trên việc editor có tô màu hay không.

### Chuỗi thường, nháy đơn và nháy kép

YAML hỗ trợ ba cách phổ biến để viết chuỗi trên một dòng:

```yaml
env:
  PLAIN: production
  PATH_PATTERN: 'src/**'
  MESSAGE: "Build: Linux"
```

- **Không quote** phù hợp với từ đơn giản như `production`.
- **Nháy đơn** giữ nội dung gần như nguyên văn. Muốn đặt một dấu nháy đơn bên trong, viết hai lần: `'It''s ready'`.
- **Nháy kép** hỗ trợ escape như `\n`, `\t` và `\"`. Dấu gạch chéo ngược có ý nghĩa đặc biệt trong kiểu này.

Nên quote khi giá trị:

- chứa `: ` hoặc ` #`;
- bắt đầu bằng ký tự đặc biệt như `*`, `&`, `!`, `{`, `[`;
- là glob pattern như `'releases/**'` hoặc `'!docs/**'`;
- trông giống boolean, `null`, số, ngày hoặc phiên bản nhưng thực chất là text;
- cần giữ khoảng trắng đầu hoặc cuối.

Ví dụ sau dễ lỗi vì YAML có thể xem phần sau `#` là comment và xem `: ` là dấu phân tách mapping:

```yaml
# Không nên
name: Build: Linux
run: echo "# heading"
```

Viết rõ ràng hơn:

```yaml
name: "Build: Linux"
run: 'echo "# heading"'
```

Với lệnh shell phức tạp, block scalar thường dễ đọc và ít xung đột quote hơn.

### Block scalar với dấu thẳng đứng và dấu lớn hơn

Dấu `|` tạo **literal block scalar**: giữ các dấu xuống dòng. Đây là lựa chọn mặc định cho nhiều lệnh `run`:

```yaml
run: |
  echo "Bước một"
  echo "Bước hai"
```

Shell nhận hai dòng lệnh riêng biệt.

Dấu `>` tạo **folded block scalar**: gấp hầu hết dấu xuống dòng thành khoảng trắng. Nó phù hợp khi muốn trình bày một lệnh dài trên nhiều dòng YAML:

```yaml
run: >-
  printf '%s\n'
  "Ứng dụng: $APP_NAME"
  "Nhánh: $GITHUB_REF_NAME"
```

Shell nhận một lệnh tương đương:

```bash
printf '%s\n' "Ứng dụng: $APP_NAME" "Nhánh: $GITHUB_REF_NAME"
```

Ký hiệu phía sau điều khiển dấu xuống dòng cuối:

| Ký hiệu | Hành vi ở cuối scalar | Dùng khi |
|---|---|---|
| `|` hoặc `>` | Giữ một dấu xuống dòng cuối | Mặc định của YAML. |
| `|-` hoặc `>-` | Loại dấu xuống dòng cuối | Muốn giá trị kết thúc ngay sau ký tự cuối. |
| `|+` hoặc `>+` | Giữ mọi dòng trống cuối | Chỉ dùng khi các dòng trống có ý nghĩa. |

<Callout type="warn" title="Không thay | bằng > một cách máy móc">
  Nếu block có nhiều lệnh shell độc lập, `>` có thể gấp chúng thành một dòng và thay đổi hành vi. Dùng `|` cho script nhiều lệnh; chỉ dùng `>` khi bạn chủ động muốn tạo một lệnh dài.
</Callout>

### Bẫy boolean, null và number

Parser có thể tự suy luận kiểu của scalar không quote. Việc suy luận còn phụ thuộc phiên bản và schema YAML mà công cụ sử dụng.

| Giá trị | Cách parser có thể hiểu | Cách viết khi cần text |
|---|---|---|
| `true`, `false` | Boolean | `"true"`, `"false"` |
| `null`, `~` | Giá trị rỗng/null | `"null"`, `"~"` |
| `20`, `3.14`, `1e3` | Number | `"20"`, `"3.14"`, `"1e3"` |
| `01`, `0644` | Có thể khác nhau giữa parser hoặc schema | `"01"`, `"0644"` |
| `yes`, `no`, `on`, `off` | Boolean trong nhiều parser YAML 1.1 cũ | Quote nếu đó là dữ liệu text |

Không phải mọi giá trị đều nên quote. Hãy giữ đúng kiểu khi khóa GitHub yêu cầu boolean hoặc number:

```yaml
continue-on-error: false
timeout-minutes: 5
```

Hãy quote khi giá trị mang ý nghĩa định danh hoặc sẽ đi vào môi trường dưới dạng text:

```yaml
env:
  CONTINUE: "false"
  TIMEOUT: "5"
  FILE_MODE: "0644"
```

Khi một trường cần boolean hoặc number nhưng nguồn là biến môi trường, dùng expression `fromJSON()` để chuyển kiểu có chủ đích:

```yaml
env:
  ALLOW_FAILURE: "false"
  TIMEOUT: "5"

jobs:
  demo:
    runs-on: ubuntu-latest
    timeout-minutes: ${{ fromJSON(env.TIMEOUT) }}
    steps:
      - continue-on-error: ${{ fromJSON(env.ALLOW_FAILURE) }}
        run: exit 1
```

### Comment không phải dữ liệu

Comment bắt đầu bằng `#` ở ngoài quoted scalar và kéo dài đến hết dòng:

```yaml
permissions:
  contents: read # Chỉ đọc mã nguồn
```

Comment nên giải thích **vì sao**, không lặp lại điều code đã nói:

```yaml
# Tốt: tổ chức yêu cầu giới hạn job không quá 10 phút.
timeout-minutes: 10
```

YAML parser loại comment trước khi GitHub xử lý workflow. Vì vậy, expression không đọc được comment và comment không thể thay thế `description` cho input.

Nếu dấu `#` là một phần của lệnh shell, dùng YAML quote hoặc block scalar:

```yaml
run: |
  echo "# Đây là dữ liệu được in ra"
```

## Expression bên trong YAML

Expression là biểu thức GitHub Actions được đặt trong `${{ }}`. Nó đọc context như `github`, `env`, `inputs`, `matrix`, `needs` hoặc `steps`, rồi tạo giá trị khi GitHub chuẩn bị workflow hoặc job.

```yaml
env:
  REF_NAME: ${{ github.ref_name }}

steps:
  - if: ${{ github.event_name == 'push' }}
    run: echo "Được kích hoạt bởi push"
```

### Hai lớp cú pháp được xử lý theo thứ tự

YAML được parse trước, sau đó GitHub mới đánh giá expression tại những trường hỗ trợ expression. Vì vậy, expression không thể cứu một cấu trúc YAML đã sai.

```yaml
# Sai: step không được thụt vào dưới steps
steps:
- name: Ví dụ
   if: ${{ github.ref_name == 'main' }}
  run: echo "main"
```

Ngay cả expression đúng, số khoảng trắng sai vẫn làm file không parse được.

Với `if`, GitHub cho phép bỏ `${{ }}` trong nhiều trường hợp. Tuy nhiên, nếu biểu thức bắt đầu bằng `!`, YAML có thể hiểu `!` là tag. Bao biểu thức trong `${{ }}` để tránh xung đột:

```yaml
if: ${{ !cancelled() }}
```

### Quote chuỗi trong expression

Quote của YAML và quote của expression là hai lớp khác nhau. Trong expression, literal string đặt trong nháy đơn. Muốn chèn một dấu nháy đơn, viết nó hai lần:

```yaml
env:
  MESSAGE: ${{ 'It''s ready' }}
```

Không dùng nháy kép cho literal bên trong `${{ }}`:

```yaml
# Sai theo cú pháp expression của GitHub Actions
env:
  MESSAGE: ${{ "ready" }}
```

Nếu toàn bộ giá trị chỉ là chuỗi tĩnh, không cần expression:

```yaml
env:
  MESSAGE: "ready"
```

Kết quả từ step output và biến môi trường thường là chuỗi. Khi cần so sánh số hoặc truyền boolean, chuyển kiểu bằng `fromJSON()` thay vì dựa vào ép kiểu ngầm.

### Khóa on và parser YAML 1.1

`on` là khóa bắt buộc quen thuộc của GitHub Actions:

```yaml
on:
  push:
  workflow_dispatch:
```

YAML 1.2 chỉ dùng `true` và `false` làm boolean trong core schema. Tuy nhiên, một số thư viện còn dùng quy tắc YAML 1.1, nơi `on`, `off`, `yes` và `no` có thể được hiểu là boolean. Công cụ đọc rồi ghi lại file có thể biến khóa `on` thành khóa `true`, làm hỏng workflow.

Có ba cách phòng tránh:

1. Cấu hình công cụ dùng YAML 1.2 và schema dành cho GitHub Actions.
2. Không để formatter hoặc script dùng parser YAML 1.1 ghi lại workflow.
3. Nếu buộc phải đi qua parser như vậy, quote khóa thành `"on":`. Quoted key vẫn là chuỗi `on` và GitHub chấp nhận nó.

<Callout type="warn" title="Đừng sửa on thành true">
  `on:` trong ví dụ chính thức của GitHub là đúng. Vấn đề nằm ở parser YAML 1.1 bên ngoài GitHub, không phải ở khóa `on` của workflow.
</Callout>

## Workflow hoàn chỉnh

Workflow dưới đây chỉ dùng lệnh có sẵn trên runner Ubuntu. Nó không checkout mã nguồn và không cần dependency, nên có thể chạy trong mọi repository đã bật GitHub Actions.

### Tạo file workflow

Tạo `.github/workflows/yaml-lab.yml` với nội dung:

```yaml
name: YAML Lab

on:
  push:
  workflow_dispatch:

permissions:
  contents: read

env:
  APP_NAME: "yaml-lab"
  RETRIES: "3"

jobs:
  inspect-yaml:
    name: Kiểm tra YAML
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Hiển thị scalar và expression
        env:
          REF_NAME: ${{ github.ref_name }}
        run: |
          printf 'Ứng dụng: %s\n' "$APP_NAME"
          printf 'Nhánh: %s\n' "$REF_NAME"
          test "$RETRIES" = "3"

      - name: Minh họa folded scalar
        run: >-
          printf '%s\n'
          "Đây là một lệnh được gấp từ nhiều dòng YAML."
          "Repository: $GITHUB_REPOSITORY"

      - name: Ghi job summary
        if: ${{ github.event_name == 'push' || github.event_name == 'workflow_dispatch' }}
        run: |
          {
            echo "## YAML Lab"
            echo "- Event: $GITHUB_EVENT_NAME"
            echo "- Repository: $GITHUB_REPOSITORY"
            echo "- Kết quả: scalar và expression hợp lệ"
          } >> "$GITHUB_STEP_SUMMARY"
```

`push` kích hoạt workflow sau khi file được push. `workflow_dispatch` cho phép chạy thủ công từ tab **Actions** khi file đã có trên nhánh mặc định.

### Đọc cấu trúc của workflow

- `on` là mapping chứa hai trigger không có cấu hình con.
- `permissions` là mapping. Token của workflow chỉ có quyền đọc nội dung repository.
- `env` là mapping các biến dùng chung. `"3"` được quote để thể hiện đây là text.
- `jobs` là mapping có job ID `inspect-yaml`.
- `steps` là sequence gồm ba mapping, được chạy tuần tự.
- Step đầu dùng literal scalar `|` để chạy ba lệnh riêng.
- Step thứ hai dùng folded scalar `>-` để trình bày một lệnh `printf` dài trên nhiều dòng.
- Step cuối kết hợp expression trong `if` với literal scalar trong `run`.

Khi thành công, step đầu in tên ứng dụng và nhánh. Step thứ hai in hai dòng bằng một lệnh `printf`. Step cuối ghi nội dung vào trang **Job summary** của run.

## Lỗi parse thường gặp

### Thiếu dấu hai chấm sau khóa

Sai:

```yaml
jobs
  build:
```

Đúng:

```yaml
jobs:
  build:
```

### Đặt sequence sai cấp

Sai vì phần tử step không nằm dưới `steps`:

```yaml
steps:
- name: Test
  run: echo "test"
```

Đoạn trên có thể vẫn là YAML hợp lệ vì YAML cho phép sequence không thụt sâu trong một số ngữ cảnh. Tuy nhiên, style này dễ gây nhầm và formatter có thể trình bày khác nhau. Trong workflow, hãy dùng cách nhất quán sau:

```yaml
steps:
  - name: Test
    run: echo "test"
```

Sai thực sự về cấu trúc workflow khi `run` không thuộc phần tử sequence:

```yaml
steps:
  - name: Test
  run: echo "test"
```

### Chuỗi chứa dấu hai chấm và khoảng trắng nhưng không quote

Sai:

```yaml
name: Build: Ubuntu
```

Đúng:

```yaml
name: "Build: Ubuntu"
```

### Glob bắt đầu bằng ký tự đặc biệt

Dấu `*` có ý nghĩa alias trong YAML. Dấu `!` có thể mở đầu tag. Hãy quote glob:

```yaml
on:
  push:
    paths:
      - 'src/**'
      - '!src/generated/**'
```

### Block scalar thụt lề không đều

Sai vì dòng thứ hai thoát khỏi nội dung `run`:

```yaml
run: |
  echo "một"
echo "hai"
```

Đúng:

```yaml
run: |
  echo "một"
  echo "hai"
```

### Trộn cú pháp YAML và schema GitHub

Đoạn dưới parse được dưới dạng YAML nhưng GitHub từ chối vì một step không thể vừa gọi action bằng `uses` vừa chạy lệnh bằng `run`:

```yaml
steps:
  - uses: actions/checkout@v4
    run: echo "done"
```

Tách thành hai step:

```yaml
steps:
  - uses: actions/checkout@v4
  - run: echo "done"
```

### Lặp khóa ở cùng cấp

Sai vì có hai khóa `env` trong cùng một mapping step:

```yaml
- name: Ví dụ
  env:
    FIRST: "1"
  env:
    SECOND: "2"
  run: echo "$FIRST $SECOND"
```

Gộp thành một mapping:

```yaml
- name: Ví dụ
  env:
    FIRST: "1"
    SECOND: "2"
  run: echo "$FIRST $SECOND"
```

## Bài thực hành

### Yêu cầu và cách thực hiện

1. Tạo file `.github/workflows/yaml-lab.yml` từ [workflow hoàn chỉnh](#workflow-hoàn-chỉnh).
2. Commit và push file lên repository:

   ```bash
   git add .github/workflows/yaml-lab.yml
   git commit -m "ci: add YAML syntax lab"
   git push
   ```

3. Mở **Actions → YAML Lab → run mới nhất → Kiểm tra YAML**.
4. Đọc log của cả ba step và mở **Summary** của run.
5. Thêm một biến text dễ bị suy luận kiểu vào `env`:

   ```yaml
   env:
     APP_NAME: "yaml-lab"
     RETRIES: "3"
     RELEASE_CODE: "01"
   ```

6. Thêm dòng sau vào step đầu, giữ đúng cấp thụt lề của các lệnh `printf` khác:

   ```bash
   test "$RELEASE_CODE" = "01"
   ```

7. Push lần nữa và xác nhận run mới vẫn thành công.
8. Tạo lỗi có chủ đích bằng cách bỏ dấu `:` sau `jobs`, commit và push. Quan sát thông báo workflow không hợp lệ, sau đó khôi phục dấu `:` và push bản sửa.

<Callout type="warn" title="Chỉ gây lỗi trên repository thực hành">
  Lỗi cú pháp có thể làm required check không được tạo hoặc chặn quy trình của pull request. Không cố ý push YAML sai vào nhánh production.
</Callout>

### Tiêu chí kiểm chứng

Bạn hoàn thành bài khi có đủ bằng chứng sau:

| Tiêu chí | Cách xác nhận |
|---|---|
| GitHub nhận file | Workflow **YAML Lab** xuất hiện trong tab **Actions**. |
| Mapping và sequence đúng | Job **Kiểm tra YAML** có đúng ba step theo thứ tự trong file. |
| Literal scalar hoạt động | Log step đầu có tên ứng dụng, tên nhánh và không thất bại ở lệnh `test`. |
| Folded scalar hoạt động | Step thứ hai in hai dòng nhưng được khai báo bằng một folded scalar `>-`. |
| Expression hoạt động | Step **Ghi job summary** chạy cho `push` hoặc `workflow_dispatch`. |
| Quote giữ đúng dữ liệu | Run sau khi thêm `RELEASE_CODE: "01"` vẫn thành công. |
| Bạn nhận diện được lỗi parse | Bản thiếu `:` bị từ chối trước khi job chạy; bản khôi phục tạo run thành công. |

## Best practices

- **Dùng hai khoảng trắng cho mỗi cấp.** Cấu hình editor chèn space khi nhấn Tab và hiển thị whitespace.
- **Ưu tiên block style.** Mapping và sequence nhiều dòng dễ review hơn dạng `{...}` hoặc `[...]` khi cấu hình phát triển.
- **Quote theo ý nghĩa dữ liệu.** Quote version, mã có số 0 đầu, glob, cron và text giống boolean/null/number. Không quote trường thực sự cần boolean hoặc number.
- **Dùng `|` cho script nhiều lệnh.** Chỉ dùng `>` khi muốn gấp nhiều dòng YAML thành một lệnh.
- **Giữ một step làm một việc.** Step ngắn giúp phát hiện lỗi shell mà không phải đọc một block `run` quá dài.
- **Không lặp khóa.** Gộp `env`, `with`, trigger hoặc permission vào một mapping ở cùng cấp.
- **Phân biệt parser với validator.** YAML linter chỉ phát hiện cú pháp chung. Cần thêm GitHub Actions schema hoặc công cụ chuyên biệt để phát hiện khóa sai vị trí.
- **Không để công cụ YAML 1.1 ghi lại workflow.** Đặc biệt kiểm tra khóa `on` sau khi chạy formatter hoặc script tự động.
- **Giới hạn thay đổi định dạng.** Tránh commit vừa đổi logic vừa format toàn bộ file; diff nhỏ dễ review và rollback hơn.
- **Đặt tên rõ nghĩa.** `name` phục vụ người đọc, còn job ID và step ID phục vụ tham chiếu trong expression. Dùng ID ổn định, không chứa khoảng trắng.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Workflow không xuất hiện trong tab **Actions** | File không nằm trong `.github/workflows/`, sai phần mở rộng hoặc YAML không parse được. | Kiểm tra chính xác đường dẫn và đuôi `.yml`/`.yaml`; mở commit trên GitHub để xem annotation lỗi. |
| Báo `You have an error in your yaml syntax` | Thiếu `:`, thụt lề lệch, dùng tab hoặc scalar chưa đóng quote. | Bật hiển thị whitespace; kiểm tra từ dòng được báo và vài dòng phía trên; so sánh từng cấp với mapping cha. |
| Báo `Unexpected value` | YAML parse được nhưng khóa đặt sai cấp hoặc không thuộc schema GitHub Actions. | Đối chiếu đường dẫn khóa với tài liệu workflow syntax; kiểm tra khóa đang thuộc workflow, job hay step. |
| Báo `A mapping was not expected` hoặc `A sequence was not expected` | Dùng mapping nơi schema cần scalar, hoặc dùng danh sách nơi schema cần mapping. | Xác định kiểu cần có tại vị trí đó; kiểm tra dấu `-` và cấp thụt lề. |
| Khóa `on` biến thành `true` sau khi format | Formatter hoặc script dùng quy tắc boolean YAML 1.1. | Chuyển công cụ sang YAML 1.2/GitHub Actions schema hoặc dùng `"on":`; không commit output bị đổi thành `true:`. |
| Giá trị `01` thành `1` | Parser trung gian suy luận giá trị là số. | Viết `"01"` và kiểm tra công cụ đọc/ghi giữ nguyên string. |
| `#` làm mất phần cuối lệnh `run` | YAML xem `#` sau khoảng trắng là mở đầu comment. | Quote toàn bộ scalar hoặc chuyển lệnh sang block `run: |`. |
| Nhiều lệnh trong `run` hành xử như một lệnh | Dùng `>` nên newline bị gấp thành khoảng trắng. | Đổi sang `|` nếu mỗi dòng phải là một lệnh shell riêng. |
| Expression báo lỗi quote | Dùng literal nháy kép bên trong `${{ }}` hoặc chưa escape nháy đơn. | Dùng nháy đơn trong expression; biểu diễn một dấu nháy đơn bằng `''`. |
| Glob hoặc điều kiện bắt đầu bằng `!` gây lỗi YAML | YAML hiểu `*` là alias hoặc `!` là tag. | Quote glob; bao điều kiện trong `${{ }}` như `if: ${{ !cancelled() }}`. |
| File parse được nhưng step bị từ chối | Một step có cả `uses` và `run`, hoặc thiếu một trong hai. | Tách action và shell command thành hai step riêng. |

## Bước tiếp theo

<Cards>
  <Card title="Cấu trúc workflow" href="/docs/nen-tang/01-cau-truc-workflow/" description="Đặt các khóa workflow, job và step vào đúng cấp." />
  <Card title="Events và triggers" href="/docs/nen-tang/03-events-va-triggers/" description="Cấu hình on, bộ lọc branch, path và loại sự kiện." />
  <Card title="Jobs và steps" href="/docs/nen-tang/04-jobs-va-steps/" description="Tổ chức đơn vị thực thi và thứ tự chạy trong workflow." />
  <Card title="Expressions" href="/docs/nen-tang/08-expressions/" description="Đi sâu vào context, toán tử, hàm và chuyển kiểu." />
</Cards>

## Nguồn chính thức

- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Evaluate expressions in workflows and actions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)
- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [YAML 1.2.2 specification — Language overview](https://yaml.org/spec/1.2.2/#chapter-2-language-overview)
- [YAML 1.2.2 specification — Indentation spaces](https://yaml.org/spec/1.2.2/#61-indentation-spaces)
- [YAML 1.2.2 specification — Block scalar styles](https://yaml.org/spec/1.2.2/#81-block-scalar-styles)
- [YAML 1.2.2 specification — Recommended schemas](https://yaml.org/spec/1.2.2/#chapter-10-recommended-schemas)
