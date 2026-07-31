---
title: "Expressions trong GitHub Actions"
description: "Viết và kiểm soát expressions an toàn với contexts, toán tử, hàm dựng sẵn, điều kiện trạng thái, matrix động và cache key."
---

<Callout type="info" title="Kết quả sau bài này">
  Bạn sẽ hiểu GitHub đánh giá expression ở đâu, dùng đúng cú pháp `${{ }}`, tránh bẫy ép kiểu và đưa dữ liệu động vào `if`, `env`, matrix cùng cache key một cách an toàn.
</Callout>

## Mục lục

- [Mô hình hoạt động](#mô-hình-hoạt-động)
  - [Hai giai đoạn xử lý](#hai-giai-đoạn-xử-lý)
- [Cú pháp và delimiters](#cú-pháp-và-delimiters)
  - [Khi bắt buộc dùng delimiters](#khi-bắt-buộc-dùng-delimiters)
  - [Khi có thể bỏ delimiters trong if](#khi-có-thể-bỏ-delimiters-trong-if)
- [Kiểu dữ liệu và phép toán](#kiểu-dữ-liệu-và-phép-toán)
  - [Literals và chuyển đổi Boolean](#literals-và-chuyển-đổi-boolean)
  - [Toán tử và loose equality](#toán-tử-và-loose-equality)
  - [Truy cập property và index](#truy-cập-property-và-index)
- [Hàm xử lý dữ liệu](#hàm-xử-lý-dữ-liệu)
  - [Chuỗi mảng và định dạng](#chuỗi-mảng-và-định-dạng)
  - [Chuyển đổi JSON](#chuyển-đổi-json)
  - [Băm tệp với hashFiles](#băm-tệp-với-hashfiles)
- [Hàm kiểm tra trạng thái](#hàm-kiểm-tra-trạng-thái)
- [Object filters](#object-filters)
- [Expression và shell interpolation](#expression-và-shell-interpolation)
- [Mẫu áp dụng thực tế](#mẫu-áp-dụng-thực-tế)
  - [Điều kiện if và env](#điều-kiện-if-và-env)
  - [Matrix động với fromJSON](#matrix-động-với-fromjson)
  - [Cache key với hashFiles](#cache-key-với-hashfiles)
- [Bảo mật dữ liệu không tin cậy](#bảo-mật-dữ-liệu-không-tin-cậy)
- [Workflow hoàn chỉnh](#workflow-hoàn-chỉnh)
- [Bài thực hành và kiểm chứng](#bài-thực-hành-và-kiểm-chứng)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Bước tiếp theo](#bước-tiếp-theo)
- [Tài liệu tham khảo chính thức](#tài-liệu-tham-khảo-chính-thức)

## Mô hình hoạt động

Expression là biểu thức mà GitHub Actions đánh giá để tạo giá trị động hoặc quyết định một job, step có được chạy hay không. Expression có thể đọc dữ liệu từ context như `github`, `inputs`, `needs`, `matrix`, `steps`, `runner`, `env`, `vars` và `secrets`.

Ví dụ sau chỉ chạy step khi sự kiện là `push` vào nhánh `main`:

```yaml
- name: Chỉ chạy trên main
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: echo "Đang kiểm tra nhánh main"
```

Không phải context nào cũng có ở mọi vị trí. Chẳng hạn, `matrix` chỉ tồn tại sau khi strategy matrix được tạo. `steps.<id>.outputs` chỉ đọc được output của step có `id` và đã chạy trước đó. Hãy kiểm tra bảng **Context availability** trong tài liệu chính thức khi một expression hợp lệ về cú pháp nhưng báo context không được phép dùng.

### Hai giai đoạn xử lý

Một workflow thường đi qua hai giai đoạn:

```text
File workflow
    │
    ├─ GitHub Actions service đánh giá expressions và điều kiện
    │  Ví dụ: jobs.<id>.if, strategy.matrix, runs-on
    │
    └─ Runner nhận job, khởi động shell và chạy từng step
       Ví dụ: Bash mở rộng $NAME, PowerShell mở rộng $env:NAME
```

Sự khác biệt này giải thích vì sao `github.ref` dùng được trong điều kiện trước khi job có runner, còn biến môi trường mặc định như `$GITHUB_REF` chỉ tồn tại khi shell đang chạy. Khi cần quyết định cấu trúc workflow, dùng context. Khi đang ở trong script, ưu tiên biến môi trường theo cú pháp của shell.

## Cú pháp và delimiters

Cặp `${{` và `}}` là delimiters, tức dấu bao quanh expression. Dạng tổng quát là:

```yaml
key: ${{ expression }}
```

Expression cũng có thể được nhúng vào một chuỗi:

```yaml
run-name: "Build #${{ github.run_number }} trên ${{ github.ref_name }}"
```

### Khi bắt buộc dùng delimiters

Ngoài khóa `if`, hãy dùng `${{ }}` để phân biệt expression với chuỗi YAML thông thường:

```yaml
env:
  BRANCH_NAME: ${{ github.ref_name }}
  IS_RELEASE: ${{ startsWith(github.ref, 'refs/tags/v') }}

jobs:
  build:
    name: ${{ format('Build {0}', github.sha) }}
    runs-on: ${{ vars.BUILD_RUNNER || 'ubuntu-latest' }}
```

Nếu bỏ delimiters ở `env`, giá trị `github.ref_name` chỉ là chuỗi ký tự, không phải dữ liệu từ context:

```yaml
env:
  SAI: github.ref_name
  DUNG: ${{ github.ref_name }}
```

### Khi có thể bỏ delimiters trong if

Khi toàn bộ giá trị của `if` là một expression, `${{ }}` là tùy chọn. Hai cách sau tương đương:

```yaml
- if: github.ref == 'refs/heads/main'
  run: echo "Cách ngắn"

- if: ${{ github.ref == 'refs/heads/main' }}
  run: echo "Cách tường minh"
```

Có một ngoại lệ YAML quan trọng: dấu `!` ở đầu giá trị được YAML hiểu là tag. Nếu điều kiện bắt đầu bằng toán tử phủ định, hãy bao expression bằng `${{ }}`:

```yaml
- name: Chạy trừ khi workflow bị hủy
  if: ${{ !cancelled() }}
  run: echo "Workflow chưa bị hủy"
```

<Callout type="warn" title="Không bỏ delimiters tùy tiện">
  Quy tắc rút gọn chỉ áp dụng cho điều kiện `if`. Với `env`, `with`, `name`, `runs-on`, output hoặc một phần của chuỗi, hãy giữ `${{ }}`.
</Callout>

## Kiểu dữ liệu và phép toán

### Literals và chuyển đổi Boolean

Expression hỗ trợ `boolean`, `null`, `number` và `string`. Number có thể ở dạng số nguyên, số thực, hexadecimal hoặc số mũ.

```yaml
env:
  NULL_VALUE: ${{ null }}
  ENABLED: ${{ true }}
  RETRIES: ${{ 3 }}
  RATIO: ${{ -2.5 }}
  HEX_VALUE: ${{ 0xff }}
  EXPONENT: ${{ -2.99e-2 }}
  PLAIN_TEXT: Mona the Octocat
  QUOTED_TEXT: ${{ 'It''s open source!' }}
```

Chuỗi literal **bên trong expression** phải dùng nháy đơn. Viết `''` để biểu diễn một dấu nháy đơn bên trong chuỗi. Dùng nháy kép bên trong `${{ }}` gây lỗi cú pháp.

Trong điều kiện, các giá trị sau là **falsy** và được chuyển thành `false`:

- `false`;
- `0` và `-0`;
- chuỗi rỗng `''` hoặc `""`;
- `null`.

`true` và mọi giá trị không thuộc danh sách trên là **truthy**. Vì vậy, chuỗi `'false'` vẫn truthy; nó không phải Boolean `false`.

```yaml
# inputs.publish là Boolean vì input được khai báo type: boolean.
if: inputs.publish

# env.PUBLISH là chuỗi; cần chuyển kiểu trước khi dùng như Boolean.
if: ${{ fromJSON(env.PUBLISH) }}
```

### Toán tử và loose equality

| Toán tử | Ý nghĩa |
|---|---|
| `( )` | Nhóm biểu thức |
| `[ ]` | Truy cập bằng index hoặc key |
| `.` | Truy cập property |
| `!` | Phủ định |
| `<`, `<=`, `>`, `>=` | So sánh thứ tự |
| `==`, `!=` | Bằng, khác |
| `&&` | Và |
| `\|\|` | Hoặc |

GitHub dùng **loose equality** cho `==` và `!=`. Khi hai toán hạng khác kiểu, GitHub ép chúng sang number:

| Giá trị | Kết quả khi ép sang number |
|---|---|
| `null` | `0` |
| `false`, `true` | `0`, `1` |
| Chuỗi rỗng | `0` |
| Chuỗi là số JSON hợp lệ | Number tương ứng |
| Chuỗi không phải số | `NaN` |
| Array, object | `NaN` |

Các hệ quả dễ gây bất ngờ:

- so sánh chuỗi không phân biệt chữ hoa và chữ thường;
- `'' == 0`, `false == 0` và `null == 0` có thể cùng cho kết quả `true` do ép kiểu;
- mọi so sánh thứ tự với `NaN` đều là `false`;
- hai array hoặc object chỉ bằng nhau khi cùng là một instance;
- output của step như `steps.build.outputs.count` luôn là string.

Khi cần so sánh số lấy từ output hoặc `env`, chuyển kiểu rõ ràng:

```yaml
- id: report
  run: echo "count=12" >> "$GITHUB_OUTPUT"

- if: ${{ fromJSON(steps.report.outputs.count) > 10 }}
  run: echo "Có hơn 10 kết quả"
```

GitHub Actions không có toán tử ba ngôi kiểu `condition ? a : b`. Có thể dùng mẫu `condition && a || b`, nhưng giá trị `a` phải truthy; nếu `a` là chuỗi rỗng hoặc `false`, expression sẽ rơi sang `b`:

```yaml
env:
  CHANNEL: ${{ github.ref == 'refs/heads/main' && 'stable' || 'preview' }}
```

Trong tài liệu hiện hành, hàm `case()` là lựa chọn rõ ràng hơn khi có nhiều nhánh:

```yaml
env:
  STAGE: ${{ case(github.ref_name == 'main', 'production', github.ref_name == 'staging', 'staging', 'development') }}
```

### Truy cập property và index

Có hai cú pháp truy cập dữ liệu context:

```yaml
env:
  SHA_DOT: ${{ github.sha }}
  SHA_INDEX: ${{ github['sha'] }}
```

Dùng property dereference (`.`) khi tên property bắt đầu bằng chữ cái hoặc `_` và chỉ chứa chữ, số, `-`, `_`. Dùng index (`[...]`) khi key nằm trong biến, chứa ký tự đặc biệt hoặc là number:

```yaml
run: echo "Port ${{ job.services.postgres.ports[5432] }}"
```

Nếu property không tồn tại, expression thường trả về chuỗi rỗng. Điều này có thể che giấu lỗi chính tả:

```yaml
# github.ref_nam bị thiếu chữ e và sẽ không cho giá trị mong muốn.
if: github.ref_nam == 'main'
```

<Callout type="idea" title="Kiểm tra property vắng mặt">
  Nếu property là bắt buộc, đừng chỉ dựa vào truthy/falsy. Hãy kiểm tra event phù hợp trước, dùng giá trị mặc định có chủ đích hoặc thêm step xác nhận để lỗi xuất hiện rõ trong log.
</Callout>

## Hàm xử lý dữ liệu

### Chuỗi mảng và định dạng

Các hàm so sánh chuỗi dưới đây không phân biệt chữ hoa và chữ thường. Một số hàm tự chuyển scalar sang string, nhưng array và object không được chuyển thành chuỗi theo cách đó.

| Hàm | Công dụng | Ví dụ và kết quả |
|---|---|---|
| `contains(search, item)` | Kiểm tra substring hoặc phần tử của array | `contains('Hello world', 'llo')` → `true` |
| `startsWith(searchString, searchValue)` | Kiểm tra tiền tố | `startsWith(github.ref, 'refs/tags/v')` |
| `endsWith(searchString, searchValue)` | Kiểm tra hậu tố | `endsWith(github.event.pull_request.head.ref, '-hotfix')` |
| `format(template, value...)` | Thay `{0}`, `{1}` trong mẫu | `format('{0}-{1}', runner.os, github.sha)` |
| `join(array, separator)` | Ghép array hoặc string; separator mặc định là `,` | `join(github.event.issue.labels.*.name, ', ')` |
| `case(predicate, value..., default)` | Trả về value của predicate đúng đầu tiên | `case(inputs.prod, 'prod', 'dev')` |

Trong `format`, dùng `{{` và `}}` khi muốn in dấu ngoặc nhọn literal:

```yaml
env:
  MESSAGE: ${{ format('{{Build {0}}}', github.run_number) }}
```

Kiểm tra nhiều event ngắn gọn bằng `contains` và một array từ JSON:

```yaml
if: ${{ contains(fromJSON('["push", "pull_request"]'), github.event_name) }}
```

### Chuyển đổi JSON

`toJSON(value)` trả về biểu diễn JSON được pretty-print. Hàm này hữu ích để quan sát một object hoặc array:

```yaml
- name: Xem matrix hiện tại
  env:
    MATRIX_JSON: ${{ toJSON(matrix) }}
  run: printf '%s\n' "$MATRIX_JSON"
```

`fromJSON(value)` thực hiện chiều ngược lại. Nó chuyển chuỗi JSON thành object, array, number, Boolean hoặc `null`:

```yaml
env:
  CONTINUE: 'false'
  TIMEOUT: '5'

jobs:
  example:
    runs-on: ubuntu-latest
    continue-on-error: ${{ fromJSON(env.CONTINUE) }}
    timeout-minutes: ${{ fromJSON(env.TIMEOUT) }}
    steps:
      - run: echo "Đã chuyển đúng kiểu"
```

Tên hàm không phân biệt chữ hoa/thường, nhưng nên viết nhất quán `toJSON` và `fromJSON` để khớp tài liệu chính thức.

<Callout type="warn" title="toJSON không phải công cụ che secret">
  Không dump toàn bộ `github`, `secrets` hoặc event payload vào log production. Context `github` chứa `github.token`; GitHub cố gắng che secret đã biết nhưng việc in dữ liệu nhạy cảm vẫn tạo rủi ro và có thể làm lộ dữ liệu sau biến đổi.
</Callout>

### Băm tệp với hashFiles

`hashFiles(pattern...)` tính SHA-256 cho từng tệp khớp glob rồi tính một SHA-256 cuối cho cả tập. Pattern tương đối với `GITHUB_WORKSPACE` và chỉ đọc tệp bên trong workspace.

```yaml
env:
  LOCK_HASH: ${{ hashFiles('**/package-lock.json', '**/npm-shrinkwrap.json') }}
```

Các điểm cần nhớ:

- có thể truyền nhiều pattern, phân tách bằng dấu phẩy;
- pattern bắt đầu bằng `!` loại trừ tệp;
- glob không phân biệt chữ hoa/thường trên Windows;
- không có tệp nào khớp thì kết quả là chuỗi rỗng;
- cần checkout repository trước khi một step dựa vào nội dung tệp trong workspace;
- `hashFiles` chỉ có ở các khóa cấp step được hỗ trợ, không dùng được tùy ý ở mọi khóa workflow.

Ví dụ loại trừ fixture:

```yaml
${{ hashFiles('src/**/*.js', '!src/fixtures/**/*.js') }}
```

## Hàm kiểm tra trạng thái

Điều kiện `if` không chứa status function được áp dụng ngầm `success()`. Vì vậy, một step bình thường sẽ không chạy nếu step trước thất bại.

| Hàm | Khi trả về `true` | Cách dùng thường gặp |
|---|---|---|
| `success()` | Tất cả step trước thành công | Step chỉ chạy trên đường thành công |
| `failure()` | Step trước trong job thất bại; với chuỗi job phụ thuộc, một ancestor job thất bại | Thu log hoặc chẩn đoán lỗi |
| `cancelled()` | Workflow đã bị hủy | Dọn tài nguyên riêng cho tình huống hủy |
| `always()` | Luôn `true`, kể cả khi bị hủy | Tác vụ ngắn cần chạy ở mọi trạng thái |

```yaml
steps:
  - name: Test
    id: tests
    run: npm test

  - name: Thu log khi test lỗi
    if: ${{ failure() && steps.tests.conclusion == 'failure' }}
    run: ./scripts/collect-logs.sh

  - name: Báo workflow bị hủy
    if: ${{ cancelled() }}
    run: echo "Run đã bị hủy"
```

`failure()` phải xuất hiện trong điều kiện xử lý lỗi để ghi đè `success()` ngầm. Chỉ viết `if: steps.tests.conclusion == 'failure'` có thể khiến step vẫn bị bỏ qua sau lỗi.

`always()` có thể khiến tác vụ vẫn chạy khi workflow bị hủy. GitHub cảnh báo không dùng nó cho tác vụ có thể treo hoặc phụ thuộc tài nguyên thiết yếu như checkout. Khi mục tiêu là “chạy nếu thành công hoặc thất bại, nhưng dừng khi người dùng hủy”, dùng cách được khuyến nghị:

```yaml
if: ${{ !cancelled() }}
```

<Callout type="warn" title="Ưu tiên !cancelled() cho cleanup thông thường">
  Chỉ dùng `always()` khi tác vụ thật sự phải chạy cả sau cancellation và có timeout hợp lý. Với phần lớn summary, upload log hoặc cleanup, `!cancelled()` giúp workflow phản hồi đúng khi người vận hành bấm hủy.
</Callout>

## Object filters

Dấu `*` chọn cùng một property từ mọi phần tử trong collection. Với payload issue có nhiều labels:

```yaml
if: ${{ contains(github.event.issue.labels.*.name, 'bug') }}
```

`github.event.issue.labels.*.name` tạo array tên label. Có thể nối array này để hiển thị:

```yaml
env:
  LABELS: ${{ join(github.event.issue.labels.*.name, ', ') }}
```

Nếu có array object:

```json
[
  { "name": "apple", "quantity": 1 },
  { "name": "orange", "quantity": 2 },
  { "name": "pear", "quantity": 1 }
]
```

Filter `fruits.*.name` trả về:

```json
["apple", "orange", "pear"]
```

`*` cũng dùng được trên object. Tuy nhiên, object không bảo đảm thứ tự property, nên thứ tự output sau filter có thể thay đổi. Đừng dùng vị trí phần tử từ object filter làm logic nghiệp vụ.

## Expression và shell interpolation

Expression interpolation và shell interpolation xảy ra ở hai nơi khác nhau:

| Cơ chế | Ai xử lý | Thời điểm | Ví dụ |
|---|---|---|---|
| Expression | GitHub Actions | Trước hoặc trong quá trình chuẩn bị job/step | `${{ github.ref_name }}` |
| Biến Bash | Shell trên runner | Khi step `run` thực thi | `$BRANCH_NAME` |
| Biến PowerShell | PowerShell trên runner | Khi step `run` thực thi | `$env:BRANCH_NAME` |

Cách sau chèn trực tiếp giá trị context vào source của script trước khi Bash chạy:

```yaml
- run: echo "Nhánh là ${{ github.ref_name }}"
```

Cách an toàn và dễ mang sang shell khác hơn là chuyển expression qua `env`, sau đó để shell đọc biến:

```yaml
- name: In nhánh trên Ubuntu
  env:
    BRANCH_NAME: ${{ github.ref_name }}
  run: printf 'Nhánh là %s\n' "$BRANCH_NAME"
```

Với PowerShell:

```yaml
- name: In nhánh trên Windows
  shell: pwsh
  env:
    BRANCH_NAME: ${{ github.ref_name }}
  run: Write-Output "Nhánh là $env:BRANCH_NAME"
```

Nói ngắn gọn: dùng expression để lấy dữ liệu GitHub và cấu hình workflow; dùng biến môi trường có quote đúng để đưa dữ liệu vào script.

## Mẫu áp dụng thực tế

### Điều kiện if và env

Ví dụ này chạy deploy dry-run khi push vào `main` hoặc khi người dùng bật input thủ công. Giá trị động được chuyển qua `env` thay vì chèn vào script:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Chỉ mô phỏng deploy"
        type: boolean
        default: true

jobs:
  deploy:
    if: ${{ github.event_name == 'push' || inputs.dry_run }}
    runs-on: ubuntu-latest
    steps:
      - name: Hiển thị kế hoạch
        env:
          EVENT_NAME: ${{ github.event_name }}
          REF_NAME: ${{ github.ref_name }}
        run: printf 'Event=%s, ref=%s\n' "$EVENT_NAME" "$REF_NAME"
```

`inputs.dry_run` giữ kiểu Boolean. Nếu đọc cùng giá trị qua `github.event.inputs.dry_run`, bạn sẽ nhận string và phải so sánh hoặc chuyển kiểu cẩn thận hơn.

### Matrix động với fromJSON

Job đầu tạo JSON dưới dạng output. Job sau dùng `fromJSON` để biến chuỗi đó thành object matrix:

```yaml
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.generate.outputs.matrix }}
    steps:
      - id: generate
        run: |
          echo 'matrix={"include":[{"os":"ubuntu-latest","node":"20"},{"os":"ubuntu-latest","node":"22"}]}' >> "$GITHUB_OUTPUT"

  test:
    needs: prepare
    strategy:
      matrix: ${{ fromJSON(needs.prepare.outputs.matrix) }}
    runs-on: ${{ matrix.os }}
    steps:
      - run: echo "Test Node ${{ matrix.node }} trên ${{ matrix.os }}"
```

Output job luôn đi qua dạng string. Nếu bỏ `fromJSON`, `strategy.matrix` không nhận được object matrix cần thiết. JSON sai dấu nháy, dấu phẩy hoặc ngoặc sẽ làm workflow lỗi khi đánh giá strategy.

### Cache key với hashFiles

Cache key nên gồm hệ điều hành, loại dependency và hash của lockfile:

```yaml
steps:
  - uses: actions/checkout@v7

  - name: Cache npm
    uses: actions/cache@v6
    with:
      path: ~/.npm
      key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
      restore-keys: |
        ${{ runner.os }}-npm-
```

Checkout phải đứng trước cache step để lockfile có trong workspace. Nếu repository không có `package-lock.json`, hash là chuỗi rỗng và nhiều commit có thể dùng chung key kết thúc bằng `npm-`. Hãy chọn đúng lockfile hoặc thêm một thành phần version tĩnh vào key.

## Bảo mật dữ liệu không tin cậy

Dữ liệu từ pull request, issue, commit, branch hoặc event payload có thể do người khác kiểm soát. Nếu chèn trực tiếp dữ liệu đó vào `run`, kẻ tấn công có thể biến nội dung thành một phần của script.

Ví dụ **không an toàn**:

```yaml
- name: Kiểm tra tiêu đề PR
  run: |
    title="${{ github.event.pull_request.title }}"
    [[ "$title" == feat:* ]]
```

Một tiêu đề chứa dấu nháy và lệnh shell có thể phá cấu trúc script sau khi expression được thay thế. Cách an toàn hơn là dùng biến môi trường trung gian:

```yaml
- name: Kiểm tra tiêu đề PR an toàn
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: |
    if [[ "$PR_TITLE" == feat:* ]]; then
      echo "Tiêu đề hợp lệ"
    else
      echo "Tiêu đề phải bắt đầu bằng feat:"
      exit 1
    fi
```

Trong cách an toàn, dữ liệu là giá trị của biến khi Bash chạy, không phải source code được ghép vào script. Vẫn phải quote `"$PR_TITLE"`, kiểm tra allowlist khi gọi công cụ bên ngoài và tránh truyền dữ liệu không tin cậy vào `eval`, `bash -c` hoặc tham số có thể đổi hành vi nguy hiểm.

Các nguyên tắc bổ sung:

- ưu tiên action nhận dữ liệu qua `with` thay vì inline script nếu có action đáng tin cậy;
- cấp `GITHUB_TOKEN` quyền tối thiểu bằng `permissions`;
- không in toàn bộ context hoặc secrets để debug;
- thận trọng đặc biệt với `pull_request_target` và không checkout code PR không tin cậy trong workflow đặc quyền;
- pin action theo full-length commit SHA trong môi trường cần bảo đảm chuỗi cung ứng chặt chẽ.

## Workflow hoàn chỉnh

Tạo `.github/workflows/expressions-lab.yml` với nội dung sau. Workflow chạy bằng `push` hoặc thủ công, tạo matrix động, dùng expression trong `name`, `if`, `env`, dùng `hashFiles`, `toJSON` và tổng kết bằng `!cancelled()`.

```yaml
name: Expressions lab
run-name: "Expressions #${{ github.run_number }} · ${{ github.ref_name }}"

on:
  push:
  workflow_dispatch:
    inputs:
      run_extended:
        description: "Chạy kiểm tra mở rộng"
        type: boolean
        required: false
        default: false

permissions:
  contents: read

env:
  GREETING: Xin chào

jobs:
  prepare:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      matrix: ${{ steps.matrix.outputs.value }}
    steps:
      - name: Tạo matrix JSON
        id: matrix
        run: |
          echo 'value={"include":[{"os":"ubuntu-latest","node":"20"},{"os":"ubuntu-latest","node":"22"}]}' >> "$GITHUB_OUTPUT"

  build:
    needs: prepare
    name: ${{ format('Node {0} trên {1}', matrix.node, matrix.os) }}
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.prepare.outputs.matrix) }}
    runs-on: ${{ matrix.os }}
    timeout-minutes: 10
    steps:
      - name: Lấy mã nguồn
        uses: actions/checkout@v7

      - name: In ngữ cảnh an toàn
        env:
          REF_NAME: ${{ github.ref_name }}
          MATRIX_JSON: ${{ toJSON(matrix) }}
          WORKFLOW_HASH: ${{ hashFiles('.github/workflows/*.yml', '.github/workflows/*.yaml') }}
        run: |
          printf '%s từ ref %s\n' "$GREETING" "$REF_NAME"
          printf 'Matrix: %s\n' "$MATRIX_JSON"
          printf 'Workflow hash: %s\n' "$WORKFLOW_HASH"

      - name: Kiểm tra mở rộng
        if: github.event_name == 'push' || inputs.run_extended
        env:
          NODE_VERSION: ${{ matrix.node }}
        run: printf 'Kiểm tra mở rộng cho Node %s\n' "$NODE_VERSION"

      - name: Xác nhận loại ref
        if: ${{ startsWith(github.ref, 'refs/heads/') || startsWith(github.ref, 'refs/tags/') }}
        env:
          FULL_REF: ${{ github.ref }}
        run: |
          printf 'Ref hợp lệ: %s\n' "$FULL_REF"

  summary:
    needs: [prepare, build]
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Tổng kết
        env:
          PREPARE_RESULT: ${{ needs.prepare.result }}
          BUILD_RESULT: ${{ needs.build.result }}
        run: |
          printf 'prepare=%s\n' "$PREPARE_RESULT"
          printf 'build=%s\n' "$BUILD_RESULT"
```

Workflow không cần dự án Node thật; `node` trong matrix chỉ là dữ liệu để quan sát expression. Vì file workflow tự nằm trong `.github/workflows`, `WORKFLOW_HASH` sẽ có giá trị sau checkout.

## Bài thực hành và kiểm chứng

1. Tạo file `.github/workflows/expressions-lab.yml` từ workflow hoàn chỉnh.
2. Commit và push lên một nhánh:

   ```bash
   git add .github/workflows/expressions-lab.yml
   git commit -m "ci: practice GitHub Actions expressions"
   git push -u origin "$(git branch --show-current)"
   ```

3. Mở **Actions → Expressions lab** và chọn run vừa tạo.
4. Xác nhận job `prepare` tạo output matrix và có hai job `build`: Node 20, Node 22.
5. Mở step **In ngữ cảnh an toàn**. Log phải có ref, JSON matrix và một workflow hash không rỗng.
6. Vì run đến từ `push`, step **Kiểm tra mở rộng** phải chạy ở cả hai matrix job.
7. Sau khi workflow có trên nhánh mặc định, chạy **Run workflow** với `run_extended=false`. Step mở rộng phải bị skip.
8. Chạy lại thủ công với `run_extended=true`. Step mở rộng phải chạy.
9. Đổi một giá trị matrix, commit rồi push. `MATRIX_JSON` trong log phải phản ánh giá trị mới.

| Tiêu chí | Bằng chứng mong đợi |
|---|---|
| Delimiters và context đúng | `run-name`, tên matrix job và các biến `env` được thay bằng giá trị thật. |
| `fromJSON` hoạt động | Có đúng hai bản sao job `build`. |
| `toJSON` hoạt động | Log hiển thị object matrix dạng JSON. |
| `hashFiles` hoạt động | `Workflow hash` là chuỗi SHA-256, không rỗng. |
| `if` phân biệt input Boolean | Run thủ công `false` skip, `true` chạy step mở rộng. |
| Status condition đúng | Job `summary` chạy khi workflow không bị hủy và in result của hai job trước. |

Để tự kiểm tra bẫy ép kiểu, thêm tạm một step sau vào job `build`, quan sát log rồi xóa nó:

```yaml
- name: Quan sát loose equality
  env:
    EMPTY_EQUALS_ZERO: ${{ '' == 0 }}
    TEXT_FALSE_IS_TRUTHY: ${{ 'false' && 'truthy' || 'falsy' }}
  run: |
    printf "'' == 0: %s\n" "$EMPTY_EQUALS_ZERO"
    printf "Chuỗi 'false': %s\n" "$TEXT_FALSE_IS_TRUTHY"
```

Kết quả mong đợi là `true` cho cả hai dòng. Bài thử này cho thấy vì sao cần kiểu dữ liệu rõ ràng thay vì dựa vào tên hoặc hình thức của chuỗi.

## Best practices

- **Giữ expression ngắn:** nếu điều kiện có nhiều nhánh, tách thành output có tên rõ ràng hoặc dùng một step/action chuyên xử lý.
- **Chuyển kiểu tường minh:** dùng `fromJSON` trước khi so sánh output dạng số hoặc dùng chuỗi `true`/`false` như Boolean.
- **Ưu tiên input có type:** dùng `inputs.<name>` cho `workflow_dispatch` và `workflow_call` để giữ Boolean/number đúng kiểu.
- **Dùng ngoặc cho logic phức tạp:** viết `(a && b) || c` để ý định dễ đọc, không dựa vào trí nhớ về độ ưu tiên toán tử.
- **Không dựa vào phân biệt hoa thường:** phép so sánh chuỗi và các hàm tìm kiếm không phân biệt hoa thường. Nếu logic cần phân biệt, xử lý bằng ngôn ngữ lập trình trong step.
- **Kiểm tra hash rỗng:** bảo đảm glob của `hashFiles` khớp ít nhất một lockfile trước khi dùng làm cache key.
- **Đặt `id` ổn định cho step có output:** chỉ step có `id` mới được tham chiếu rõ qua `steps.<id>.outputs`.
- **Dùng `!cancelled()` thay cho `always()` theo mặc định:** workflow sẽ dừng đúng kỳ vọng khi người dùng hủy.
- **Đưa dữ liệu event qua `env`:** không chèn trực tiếp dữ liệu không tin cậy vào `run`; luôn quote biến theo shell.
- **Debug có phạm vi:** dùng `toJSON` cho object cần thiết như `matrix`, không dump toàn bộ `github` hoặc `secrets`.
- **Đọc bảng context availability:** một expression đúng không có nghĩa context hoặc hàm đó hợp lệ ở mọi workflow key.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Workflow báo lỗi tại `${{ "text" }}` | String literal trong expression dùng nháy kép. | Đổi thành `${{ 'text' }}`; dùng `''` để escape nháy đơn bên trong. |
| `if: !cancelled()` bị lỗi YAML | `!` ở đầu được YAML hiểu là tag. | Dùng `if: ${{ !cancelled() }}`. |
| Giá trị `env` in ra nguyên văn `github.ref_name` | Đã bỏ delimiters ngoài khóa `if`. | Viết `REF_NAME: ${{ github.ref_name }}`. |
| Điều kiện với chuỗi `'false'` vẫn chạy | Chuỗi không rỗng là truthy. | Dùng input Boolean hoặc `fromJSON(value)` nếu value là JSON Boolean hợp lệ. |
| So sánh output số cho kết quả lạ | Step output luôn là string và loose equality có ép kiểu. | Dùng `fromJSON(steps.<id>.outputs.<name>)` trước phép so sánh số. |
| Property luôn rỗng | Sai tên property, event không cung cấp field đó hoặc context chưa khả dụng. | Kiểm tra event, chính tả và bảng context availability; debug object nhỏ bằng `toJSON`. |
| Matrix báo “not valid JSON” | Output JSON sai quote, dấu phẩy hoặc ngoặc; output có thêm text. | Chỉ ghi một cặp `name=value` hợp lệ vào `$GITHUB_OUTPUT`; kiểm tra JSON bằng `jq` trước khi xuất. |
| Cache key kết thúc bằng `npm-` | Glob không khớp tệp hoặc cache step chạy trước checkout. | Checkout trước, kiểm tra đúng tên lockfile và in riêng hash khi chẩn đoán. |
| Step thu log bị skip sau khi test lỗi | Điều kiện không chứa status function nên chịu `success()` ngầm. | Thêm `failure()`, ví dụ `failure() && steps.tests.conclusion == 'failure'`. |
| Workflow không dừng nhanh sau cancellation | Tác vụ dùng `always()` hoặc không có timeout. | Đổi sang `!cancelled()` khi phù hợp và đặt `timeout-minutes`. |
| Script lỗi khi PR title chứa dấu nháy | Dữ liệu event được chèn trực tiếp vào source của `run`. | Chuyển expression qua `env`, quote biến shell và kiểm tra allowlist. |
| `hashFiles` không dùng được ở một khóa job | Hàm đặc biệt này chỉ khả dụng tại các khóa step được hỗ trợ. | Tính hash trong step hoặc chuyển thiết kế sang output; kiểm tra bảng context availability. |

## Bước tiếp theo

<Cards>
  <Card title="Contexts" href="/docs/nen-tang/07-contexts/" description="Hiểu dữ liệu có sẵn trong github, needs, steps, matrix, runner và các context khác." />
  <Card title="Variables và environment variables" href="/docs/nen-tang/09-variables-va-environment-variables/" description="Phân biệt context env, biến cấu hình và biến được shell mở rộng trên runner." />
  <Card title="Secrets" href="/docs/nen-tang/10-secrets/" description="Quản lý dữ liệu nhạy cảm và giới hạn cách secrets đi vào workflow." />
  <Card title="Cấu trúc workflow" href="/docs/nen-tang/01-cau-truc-workflow/" description="Đặt expressions đúng vị trí trong workflow, job và step." />
</Cards>

## Tài liệu tham khảo chính thức

- [Evaluate expressions in workflows and actions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)
- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Dependency caching reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
- [actions/cache](https://github.com/actions/cache)
