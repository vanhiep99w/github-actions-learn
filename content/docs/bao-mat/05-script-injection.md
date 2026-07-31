---
title: "Phòng chống script injection"
description: "Nhận diện dữ liệu không tin cậy, ngăn nội suy expression biến thành lệnh và xử lý an toàn Bash, PowerShell, JavaScript cùng workflow commands trong GitHub Actions."
---

<Callout type="error" title="Dữ liệu sự kiện không phải mã nguồn">
  Mọi giá trị do người dùng hoặc repository bên ngoài tác động được phải được xem là dữ liệu không tin cậy. Không nhúng trực tiếp `${{ github.event.* }}` vào `run` hoặc `script`. Ưu tiên action đã review; nếu cần inline script, truyền giá trị qua `env`, đọc bằng cú pháp của shell và quote đúng.
</Callout>

## Mục lục

- [Mô hình tinh thần](#mô-hình-tinh-thần)
  - [Hai giai đoạn xử lý](#hai-giai-đoạn-xử-lý)
  - [Command injection và expression injection](#command-injection-và-expression-injection)
- [Mô hình đe dọa](#mô-hình-đe-dọa)
  - [Tác nhân tài sản và hậu quả](#tác-nhân-tài-sản-và-hậu-quả)
  - [Nguồn dữ liệu không tin cậy](#nguồn-dữ-liệu-không-tin-cậy)
  - [Điểm thực thi nguy hiểm](#điểm-thực-thi-nguy-hiểm)
  - [Pull request từ fork](#pull-request-từ-fork)
- [Anti-pattern cần loại bỏ](#anti-pattern-cần-loại-bỏ)
  - [Nội suy trực tiếp vào Bash](#nội-suy-trực-tiếp-vào-bash)
  - [Nội suy trực tiếp vào PowerShell và JavaScript](#nội-suy-trực-tiếp-vào-powershell-và-javascript)
- [Biện pháp phòng thủ ưu tiên](#biện-pháp-phòng-thủ-ưu-tiên)
  - [Ưu tiên action thay cho inline script](#ưu-tiên-action-thay-cho-inline-script)
  - [Bash với biến môi trường và quote](#bash-với-biến-môi-trường-và-quote)
  - [PowerShell với biến môi trường và đối số](#powershell-với-biến-môi-trường-và-đối-số)
  - [JavaScript đọc process env](#javascript-đọc-process-env)
  - [Validate theo allowlist](#validate-theo-allowlist)
- [Khác biệt quoting giữa các shell](#khác-biệt-quoting-giữa-các-shell)
  - [Bash và sh](#bash-và-sh)
  - [PowerShell](#powershell)
  - [Những cơ chế phải tránh](#những-cơ-chế-phải-tránh)
- [Environment files và workflow commands](#environment-files-và-workflow-commands)
  - [GITHUB_ENV không phải kênh dữ liệu tùy ý](#github_env-không-phải-kênh-dữ-liệu-tùy-ý)
  - [Ghi log dữ liệu không tin cậy](#ghi-log-dữ-liệu-không-tin-cậy)
  - [Dùng stop commands đúng cách](#dùng-stop-commands-đúng-cách)
- [Review và audit](#review-và-audit)
  - [Review theo luồng dữ liệu](#review-theo-luồng-dữ-liệu)
  - [CodeQL cho GitHub Actions](#codeql-cho-github-actions)
  - [Grep nhanh và giới hạn](#grep-nhanh-và-giới-hạn)
- [Bài thực hành an toàn](#bài-thực-hành-an-toàn)
  - [Chuẩn bị](#chuẩn-bị)
  - [Workflow phòng lab](#workflow-phòng-lab)
  - [Payload và tiêu chí kiểm chứng](#payload-và-tiêu-chí-kiểm-chứng)
- [Best practices cho production](#best-practices-cho-production)
- [Troubleshooting](#troubleshooting)
- [Bài bảo mật liên quan](#bài-bảo-mật-liên-quan)
- [Tài liệu tham khảo chính thức](#tài-liệu-tham-khảo-chính-thức)

## Mô hình tinh thần

Script injection xảy ra khi dữ liệu mà attacker có thể kiểm soát đi qua một ranh giới và được trình thông dịch xem như mã. Trong GitHub Actions, ranh giới thường bị bỏ qua là expression `${{ ... }}` nằm bên trong `run` hoặc trường `script` của một action.

### Hai giai đoạn xử lý

Một step `run` không được chuyển nguyên văn tới shell. GitHub Actions và runner chuẩn bị step trước, thay expression bằng giá trị thật, tạo script tạm, rồi mới gọi shell.

```text
Workflow YAML
    │
    ├─ 1. Actions đánh giá expression
    │     ${{ github.event.pull_request.title }} → chuỗi từ payload
    │
    ├─ 2. Runner tạo source của script tạm
    │
    └─ 3. Bash, PowerShell hoặc shell khác phân tích source và thực thi
```

Xét anti-pattern tối giản:

```yaml
# KHÔNG AN TOÀN — không chạy trong repository production.
- run: echo "${{ github.event.pull_request.title }}"
```

Nếu title có dấu nháy, dấu chấm phẩy, command substitution hoặc ký tự điều khiển phù hợp với shell, giá trị đó có thể đóng chuỗi do tác giả workflow viết và tạo thêm cú pháp. Dấu nháy bao quanh expression trong YAML hay trong source Bash không còn là lớp bảo vệ đáng tin, vì dữ liệu được chèn vào **trước** khi Bash phân tích.

Cách đúng tạo một ranh giới dữ liệu:

```yaml
- name: Xử lý title như dữ liệu
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  shell: bash
  run: printf '%s\n' "$PR_TITLE"
```

Ở đây expression tạo giá trị của environment variable. Bash chỉ thấy source tĩnh `printf '%s\n' "$PR_TITLE"`; nội dung của biến không được Bash phân tích lại như source.

### Command injection và expression injection

Hai thuật ngữ này liên quan nhưng không đồng nghĩa:

| Khái niệm | Điều bị chèn | Ví dụ | Kết luận |
|---|---|---|---|
| **Expression interpolation** | Giá trị context được Actions thay vào template workflow | `${{ github.event.issue.body }}` trong `run` | Là chiếc cầu đưa dữ liệu vào source script |
| **Command injection** | Cú pháp lệnh được shell hoặc process launcher thực thi | dữ liệu đi vào Bash, `cmd /c`, `Invoke-Expression`, `exec("...")` | Là hậu quả phổ biến của nội suy không an toàn |
| **Expression injection thật sự** | Dữ liệu được một expression hoặc template engine đánh giá lần hai | action nhận input rồi đưa vào `eval` hay template có khả năng chạy code | Phụ thuộc logic của action hoặc tool phía sau |

GitHub Actions không đánh giá đệ quy payload như một expression mới chỉ vì payload chứa `${{ ... }}`. Vấn đề phổ biến là **expression hợp lệ trong workflow chèn ký tự vào source shell**, sau đó shell thực thi ký tự đó. Tuy nhiên, một action tùy chỉnh có thể tạo lỗ hổng expression injection thật sự nếu nó đưa input vào `eval`, template engine hoặc API chạy code.

<Callout type="info" title="Câu hỏi review quan trọng nhất">
  Đừng chỉ hỏi “expression này có hợp lệ không?”. Hãy hỏi “giá trị sau expression sẽ đi vào trình thông dịch nào, ở vị trí source, đối số, đường dẫn, workflow command hay dữ liệu thuần?”.
</Callout>

## Mô hình đe dọa

### Tác nhân tài sản và hậu quả

Attacker không nhất thiết có quyền ghi repository. Họ có thể là người mở pull request từ fork, tạo issue, comment, review hoặc gửi một payload tới trigger được công khai. Một contributor có quyền hạn chế cũng có thể kiểm soát branch, commit message hay metadata Git.

| Thành phần | Ví dụ |
|---|---|
| Tác nhân | contributor từ fork, người tạo issue, người comment, dependency hoặc action bị compromise |
| Điểm vào | event payload, input thủ công, output job/action, artifact hoặc file từ code không tin cậy |
| Tài sản | `GITHUB_TOKEN`, secrets được tham chiếu, source private, artifact, package, cloud credential, runner |
| Hậu quả | chạy lệnh, lấy credential, sửa repository, publish artifact độc hại, persistence trên self-hosted runner |

Mức tác động phụ thuộc privilege của job. Một injection trong job `pull_request` chỉ đọc vẫn có thể đọc source và đầu độc kết quả kiểm thử. Cùng lỗi đó trong `issues`, `issue_comment`, `pull_request_target`, release hoặc deploy job có token ghi và secrets có thể dẫn tới chiếm repository hay hạ tầng.

Giảm quyền không sửa được injection, nhưng giảm blast radius:

```yaml
permissions: {}

jobs:
  inspect:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - run: echo "Job này không có quyền ghi repository."
```

### Nguồn dữ liệu không tin cậy

Không có danh sách đóng cho mọi webhook. Hãy đọc schema payload của đúng event và coi toàn bộ `github.event` là không tin cậy cho đến khi chứng minh ngược lại.

| Nguồn | Context thường gặp | Ai có thể tác động |
|---|---|---|
| Title và body của PR | `github.event.pull_request.title`, `github.event.pull_request.body` | tác giả PR, gồm contributor từ fork |
| Title và body của issue | `github.event.issue.title`, `github.event.issue.body` | người có thể tạo hoặc sửa issue |
| Comment và review | `github.event.comment.body`, `github.event.review.body` | người comment hoặc review |
| Branch nguồn của PR | `github.head_ref`, `github.event.pull_request.head.ref`, `github.event.pull_request.head.label` | chủ fork hoặc tác giả branch |
| Branch hay tag của push và create | `github.ref_name`, `github.event.ref` | người có quyền tạo ref; trust phụ thuộc repository và event |
| Labels | `github.event.label.name`, `github.event.pull_request.labels.*.name`, `github.event.issue.labels.*.name` | người hoặc bot có quyền quản lý hay chọn label |
| Commit message | `github.event.head_commit.message`, `github.event.commits.*.message` | tác giả commit hoặc contributor |
| Tác giả commit | `github.event.head_commit.author.name`, `github.event.head_commit.author.email` | metadata Git do tác giả commit đặt |
| Trigger bên ngoài | `github.event.client_payload.*`, `inputs.*`, `github.event.inputs.*` | caller của dispatch hoặc người chạy thủ công |
| Dữ liệu từ step khác | `steps.*.outputs.*`, `needs.*.outputs.*` | action, script hoặc job đã tạo output |

Branch và tag bị Git giới hạn một số ký tự, nhưng giới hạn ref **không phải sanitizer cho shell**. Nhiều metacharacter vẫn hợp lệ. Labels thường cần quyền cao hơn title, nhưng automation hoặc tài khoản bị chiếm vẫn có thể tạo dữ liệu bất ngờ. Vì vậy, trust phải dựa trên quyền và luồng event cụ thể, không dựa trên “trường này thường trông đơn giản”.

Các payload sau chỉ dùng để review hoặc trong repository lab. Chúng chỉ tạo marker, không xóa dữ liệu hay gửi thông tin ra mạng:

| Payload minh họa | Điều cần kiểm tra |
|---|---|
| `docs: dùng dấu " trong title` | quote không làm hỏng script |
| `$(printf INJECTION_MARKER)` | command substitution được giữ như dữ liệu |
| `feature/demo;printf${IFS}INJECTION_MARKER` | metacharacter và word separator không trở thành lệnh |
| `::warning::UNTRUSTED_MARKER` | log không bị hiểu nhầm thành workflow command |
| body nhiều dòng chứa `NAME=changed` | dữ liệu không chèn thêm dòng vào `GITHUB_ENV` |

<Callout type="warn" title="Payload lab không chứng minh production an toàn">
  Một payload marker chỉ chứng minh đúng ca kiểm thử đó không chạy. Attacker có nhiều cú pháp khác nhau theo shell. Biện pháp đúng là loại bỏ đường dữ liệu đi vào source code, không phải lập blocklist ký tự nguy hiểm.
</Callout>

### Điểm thực thi nguy hiểm

Các sink cần review không chỉ có `run`:

- `run:` trong workflow và composite action;
- `script:` của actions chạy JavaScript, Python hoặc template;
- `eval`, `bash -c`, `sh -c`, `cmd /c`, `Invoke-Expression`;
- Node.js `child_process.exec`, Python `os.system` hoặc `subprocess(..., shell=True)`;
- tool nhận template, query hay expression có khả năng thực thi;
- tên executable, option, đường dẫn hoặc glob được xây từ dữ liệu không tin cậy;
- file command như `GITHUB_ENV`, `GITHUB_OUTPUT`, `GITHUB_PATH`;
- dữ liệu in ra stdout có dạng workflow command `::command::value`.

Một action nhận input qua `with` không tự động an toàn. Nó an toàn hơn inline script khi action xử lý input như dữ liệu hoặc một đối số. Nếu source action lại ghép input vào `exec("tool " + input)`, rủi ro command injection quay trở lại bên trong action.

### Pull request từ fork

Với public fork, trigger `pull_request` chạy code từ merge branch của PR trong ngữ cảnh ít đặc quyền: stored secrets không được cấp và `GITHUB_TOKEN` bị giới hạn chỉ đọc. Contributor có thể cần maintainer phê duyệt run theo policy. Approval cho phép workflow chạy; approval không sanitize title, body, branch, commit hay source code.

```yaml
name: Fork-safe metadata check

on:
  pull_request:

permissions:
  contents: read

jobs:
  title:
    runs-on: ubuntu-latest
    steps:
      - name: Kiểm tra title như dữ liệu
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        shell: bash
        run: |
          set -euo pipefail
          pattern='^(feat|fix|docs)(\([a-z0-9-]+\))?: .{1,72}$'
          [[ "$PR_TITLE" =~ $pattern ]]
```

`pull_request_target` khác hẳn. Workflow và checkout mặc định đến từ base repository, nhưng job có ngữ cảnh tin cậy cao hơn, token của base và quyền truy cập secrets được tham chiếu. Event payload vẫn chứa metadata do contributor kiểm soát. Không nội suy title, body hay head ref vào script của trigger này.

<Callout type="error" title="Không chạy PR head trong pull_request_target">
  Không checkout `github.event.pull_request.head.sha`, không cài dependency, không chạy build script và không thực thi artifact từ fork trong job đặc quyền. Theo GitHub Docs hiện hành năm 2026, `actions/checkout` v7 trở lên có bảo vệ mặc định cho một số checkout fork nguy hiểm; cờ `allow-unsafe-pr-checkout: true` chủ động bỏ bảo vệ đó. Đây không phải giấy phép chạy code PR với secrets.
</Callout>

Nếu chỉ cần label hay comment, giữ workflow ở base code, không checkout PR, cấp permission metadata tối thiểu và xử lý tất cả payload như dữ liệu. Nếu cần test code PR, dùng `pull_request`; chuyển publish hoặc deploy sang event tin cậy sau merge.

## Anti-pattern cần loại bỏ

<Callout type="error" title="Các ví dụ dưới đây cố ý không an toàn">
  Không sao chép hoặc chạy các anti-pattern trong repository production, runner có secrets hay self-hosted runner. Chúng chỉ minh họa vị trí dữ liệu bị biến thành source code.
</Callout>

### Nội suy trực tiếp vào Bash

Quote trong source không cứu được dữ liệu đã được chèn trước khi shell phân tích:

```yaml
# KHÔNG AN TOÀN — title được ghép vào source Bash.
- name: Echo title
  shell: bash
  run: echo "${{ github.event.pull_request.title }}"
```

Gán vào biến shell trong cùng `run` vẫn là nội suy source:

```yaml
# KHÔNG AN TOÀN — phép gán không tạo ranh giới dữ liệu.
- name: Validate branch
  shell: bash
  run: |
    branch='${{ github.head_ref }}'
    ./scripts/check-branch.sh "$branch"
```

Dùng `env` rồi đọc lại bằng expression trong `run` cũng vẫn sai:

```yaml
# KHÔNG AN TOÀN — ${{ env.PR_BODY }} lại được nội suy vào script.
- name: Echo body
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  shell: bash
  run: printf '%s\n' '${{ env.PR_BODY }}'
```

Expression nguy hiểm có thể nằm ở dòng sâu trong block `run`:

```yaml
# KHÔNG AN TOÀN — labels và commit message có thể chứa ký tự bất ngờ.
- shell: bash
  run: |
    echo "labels=${{ join(github.event.pull_request.labels.*.name, ',') }}"
    echo "message=${{ github.event.head_commit.message }}"
```

Quy tắc sửa là: expression chỉ xuất hiện ở `env` hoặc `with`; source script đọc environment variable hay input bằng API runtime.

### Nội suy trực tiếp vào PowerShell và JavaScript

PowerShell cũng bị ảnh hưởng vì Actions thay expression trước khi PowerShell parse:

```yaml
# KHÔNG AN TOÀN — không chạy trong production.
- name: Read PR title
  shell: pwsh
  run: |
    $title = "${{ github.event.pull_request.title }}"
    Write-Output $title
```

Một action có trường `script` tạo JavaScript source cũng có cùng rủi ro:

```yaml
# KHÔNG AN TOÀN — dữ liệu có thể phá string literal JavaScript.
- name: Inspect issue
  uses: actions/github-script@REF_DA_PIN
  with:
    script: |
      const body = "${{ github.event.issue.body }}";
      console.log(body);
```

`REF_DA_PIN` ở đây chỉ là ký hiệu để nhắc pin action đã review; nó không phải ref có thể chạy. Ngay cả khi action được pin đúng SHA, nội suy trực tiếp vào `script` vẫn tạo code injection.

## Biện pháp phòng thủ ưu tiên

Thứ tự ưu tiên thực hành:

1. dùng action hoặc chương trình đã review, nhận giá trị qua input hay argument;
2. nếu cần inline script, đặt expression ở `env`, đọc biến bằng cú pháp shell và quote đúng;
3. validate theo allowlist khi dữ liệu điều khiển tên, đường dẫn, option hay hành động;
4. loại bỏ `eval` và các API gọi shell bằng chuỗi;
5. giới hạn `permissions`, secrets, network và runner để giảm hậu quả khi có lỗi.

### Ưu tiên action thay cho inline script

Mẫu GitHub khuyến nghị là chuyển context thành input của một JavaScript action. Dữ liệu không tham gia tạo source shell:

```yaml
- name: Kiểm tra title bằng action đã review
  uses: YOUR_ORG/security-actions/check-title@FULL_40_CHARACTER_COMMIT_SHA
  with:
    title: ${{ github.event.pull_request.title }}
```

Hai giá trị viết hoa là placeholder bắt buộc thay bằng repository canonical và full SHA 40 ký tự đã xác minh. Action phải đọc input bằng API runtime và không dùng `exec`, `eval` hoặc template thực thi với input đó.

Một action JavaScript tối giản có thể xử lý input như sau:

```yaml title="action.yml"
name: Check PR title
description: Validate a PR title without invoking a shell
inputs:
  title:
    description: Pull request title
    required: true
runs:
  using: node24
  main: index.js
```

```javascript title="index.js"
'use strict';

const title = process.env.INPUT_TITLE ?? '';
const allowed = /^(feat|fix|docs)(\([a-z0-9-]+\))?: .{1,72}$/u;

if (!allowed.test(title)) {
  process.stderr.write('Title không khớp convention yêu cầu.\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`Title hợp lệ; độ dài=${title.length}.\n`);
}
```

Action không in raw title, không tạo command string và không khởi động shell. Khi dùng trong production, đặt action ở repository được bảo vệ, pin caller bằng full SHA và review cả file entrypoint thực tế. Local action trong code của PR vẫn có thể bị PR sửa; đừng chạy local action từ PR head trong job có secrets.

### Bash với biến môi trường và quote

Ví dụ copy được cho title, branch và commit message:

```yaml
- name: Validate untrusted metadata with Bash
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
    HEAD_BRANCH: ${{ github.head_ref }}
    COMMIT_MESSAGE: ${{ github.event.head_commit.message }}
  shell: bash
  run: |
    set -euo pipefail

    title_pattern='^(feat|fix|docs)(\([a-z0-9-]+\))?: .{1,72}$'
    branch_pattern='^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$'

    if [[ ! "$PR_TITLE" =~ $title_pattern ]]; then
      printf 'Title không hợp lệ.\n' >&2
      exit 1
    fi

    if [[ -n "$HEAD_BRANCH" && ! "$HEAD_BRANCH" =~ $branch_pattern ]]; then
      printf 'Branch không khớp allowlist nội bộ.\n' >&2
      exit 1
    fi

    printf 'Đã kiểm title, branch và commit message dài %s byte.\n' \
      "${#COMMIT_MESSAGE}"
```

Nếu gọi chương trình ngoài, giữ executable và option ở source tĩnh. Dùng `--` để kết thúc option khi công cụ hỗ trợ:

```yaml
- name: Pass body as one argument
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  shell: bash
  run: |
    set -euo pipefail
    ./scripts/check-body.sh -- "$PR_BODY"
```

`--` không phải cơ chế universal; đọc tài liệu CLI đích. Script `check-body.sh` vẫn phải xử lý đối số như dữ liệu và không đưa `$1` vào `eval` hay `sh -c`.

Với labels, dùng JSON thay vì tự tạo chuỗi phân tách mà tên label có thể làm mơ hồ:

```yaml
- name: Validate label names
  env:
    LABELS_JSON: ${{ toJSON(github.event.pull_request.labels.*.name) }}
  shell: bash
  run: |
    set -euo pipefail
    jq -e '
      type == "array" and
      all(.[]; type == "string" and test("^[A-Za-z0-9._ -]{1,50}$"))
    ' <<<"$LABELS_JSON" >/dev/null
```

### PowerShell với biến môi trường và đối số

Trong PowerShell, đọc environment variable bằng `$env:NAME`. Dùng call operator `&` với từng argument riêng thay vì ghép một command string:

```yaml
- name: Validate metadata with PowerShell
  shell: pwsh
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
    REF_NAME: ${{ github.ref_name }}
  run: |
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'

    $titlePattern = '^(feat|fix|docs)(\([a-z0-9-]+\))?: .{1,72}$'
    $refPattern = '^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$'

    if ($env:PR_TITLE -notmatch $titlePattern) {
      throw 'Title không khớp convention yêu cầu.'
    }
    if ($env:REF_NAME -notmatch $refPattern) {
      throw 'Ref không khớp allowlist nội bộ.'
    }

    & node './scripts/check-title.mjs' '--' $env:PR_TITLE
    if ($LASTEXITCODE -ne 0) {
      throw "Trình kiểm tra trả mã $LASTEXITCODE."
    }
```

`$env:PR_TITLE` ở vị trí argument là một object string tại runtime. Nội dung của nó không được PowerShell parse lại thành code. Tránh `Invoke-Expression`, `powershell -Command <chuỗi động>` và `cmd /c <chuỗi động>`.

### JavaScript đọc process env

Một Node.js script không cần đưa title vào JavaScript source. Script đọc từ `process.env`:

```yaml
- name: Validate PR metadata with Node.js
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
    PR_BODY: ${{ github.event.pull_request.body }}
  shell: bash
  run: node .github/scripts/validate-pr-metadata.mjs
```

```javascript title=".github/scripts/validate-pr-metadata.mjs"
const title = process.env.PR_TITLE ?? '';
const body = process.env.PR_BODY ?? '';
const titlePattern = /^(feat|fix|docs)(\([a-z0-9-]+\))?: .{1,72}$/u;

if (!titlePattern.test(title)) {
  process.stderr.write('PR title không hợp lệ.\n');
  process.exit(1);
}

process.stdout.write(
  JSON.stringify({ titleValid: true, bodyLength: body.length }) + '\n',
);
```

Nếu JavaScript cần gọi process khác, ưu tiên API không mở shell và truyền mảng argument:

```javascript
import { spawnSync } from 'node:child_process';

const title = process.env.PR_TITLE ?? '';
const result = spawnSync('node', ['./scripts/check-title.mjs', '--', title], {
  shell: false,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
```

Không đổi thành `exec("node ./scripts/check-title.mjs " + title)`. `exec` chạy một command string qua shell và khôi phục đường injection.

### Validate theo allowlist

Quote đúng giữ dữ liệu không trở thành source. Validation giải quyết lớp khác: dữ liệu có được phép điều khiển nghiệp vụ hay không.

| Cách dùng | Kiểm soát nên có |
|---|---|
| Chỉ hiển thị hoặc đo độ dài | không cần xóa mọi punctuation; giữ ranh giới dữ liệu và log an toàn |
| Chọn environment | so sánh với tập cố định như `test`, `staging`, `production` |
| Tạo tên artifact | regex ký tự và độ dài; không cho path separator nếu không cần |
| Tạo đường dẫn | resolve dưới thư mục gốc tin cậy rồi kiểm tra không thoát root |
| Chọn option CLI | map input sang option tĩnh; không truyền raw input làm option |
| Chọn command | map enum sang executable cố định; không dùng input làm tên lệnh |
| Dùng URL | allowlist scheme và host; cân nhắc SSRF và credential forwarding |

Ví dụ map input thành hành động tĩnh trong Bash:

```yaml
- name: Map input to a fixed command
  env:
    MODE: ${{ inputs.mode }}
  shell: bash
  run: |
    set -euo pipefail
    case "$MODE" in
      lint) command=(npm run lint) ;;
      test) command=(npm test) ;;
      *) printf 'Mode không hợp lệ.\n' >&2; exit 1 ;;
    esac
    "${command[@]}"
```

Không viết `eval "$MODE"` hoặc `$MODE` như tên lệnh.

## Khác biệt quoting giữa các shell

Quote là cú pháp của shell, không phải tính năng của YAML hay GitHub expression. Hãy đặt `shell` tường minh cho step bảo mật để reviewer biết quy tắc nào đang áp dụng.

| Shell | Đọc biến | Quote thường dùng | Lưu ý |
|---|---|---|---|
| Bash | `"$NAME"` | nháy kép giữ một argument; nháy đơn là literal | biến không quote gây word splitting và glob expansion |
| POSIX sh | `"$NAME"` | tương tự Bash cho expansion cơ bản | không có `[[ ... ]]`, array hay regex Bash |
| PowerShell Core | `$env:NAME` | nháy đơn là literal; nháy kép mở rộng biến | dữ liệu trong biến không tự được parse lại, trừ khi dùng API đánh giá chuỗi |
| Windows PowerShell 5.1 | `$env:NAME` | giống PowerShell, nhưng encoding file command cần UTF-8 tường minh | ưu tiên `pwsh` khi có thể |
| cmd.exe | `%NAME%` | quy tắc metacharacter và delayed expansion phức tạp | ưu tiên `pwsh`; tránh `cmd /c` với dữ liệu động |

### Bash và sh

Trong Bash, mẫu mặc định là:

```bash
printf '%s\n' "$UNTRUSTED_VALUE"
tool --fixed-option -- "$UNTRUSTED_VALUE"
```

Nháy kép cho phép Bash mở rộng biến đúng một lần và giữ toàn bộ giá trị thành một word. Nội dung như `$(...)`, dấu chấm phẩy hay wildcard nằm **bên trong giá trị biến** không được parse lại thành cú pháp.

Những mẫu dễ sai:

```bash
# KHÔNG AN TOÀN hoặc dễ lỗi.
printf '%s\n' $UNTRUSTED_VALUE    # word splitting và glob expansion
eval "tool $UNTRUSTED_VALUE"     # parse lần hai thành code
sh -c "tool $UNTRUSTED_VALUE"    # parse qua shell mới
```

Nháy đơn `'$UNTRUSTED_VALUE'` in đúng chữ `$UNTRUSTED_VALUE`; nó không đọc biến. Đừng chuyển sang nháy đơn rồi quay lại expression `${{ ... }}` để “sửa” lỗi, vì expression vẫn bị nội suy trước shell.

### PowerShell

Trong PowerShell:

```powershell
Write-Output $env:UNTRUSTED_VALUE
& tool.exe '--fixed-option' '--' $env:UNTRUSTED_VALUE
```

Chuỗi nháy đơn không expand biến:

```powershell
Write-Output '$env:UNTRUSTED_VALUE' # In literal, không in giá trị.
```

Chuỗi nháy kép có expand biến, nhưng nội dung lấy từ biến không được thực thi lại:

```powershell
Write-Output "Giá trị dài $($env:UNTRUSTED_VALUE.Length) ký tự."
```

Subexpression `$()` do tác giả viết trong source được thực thi. Chuỗi ký tự `$()` nằm bên trong giá trị của `$env:UNTRUSTED_VALUE` không được đánh giá lần hai, trừ khi script đưa chuỗi đó vào `Invoke-Expression` hoặc một parser khác.

### Những cơ chế phải tránh

- `eval`, `source` một file không tin cậy, `bash -c` hoặc `sh -c` với chuỗi động;
- PowerShell `Invoke-Expression`, `ScriptBlock.Create` từ input, `-Command` ghép chuỗi;
- `cmd /c` với input hoặc environment variable không tin cậy;
- Node.js `exec` và `execSync` với command string; ưu tiên `execFile`, `spawn` và `shell: false`;
- Python `os.system`, `subprocess(..., shell=True)`; ưu tiên danh sách argument và `shell=False`;
- tự escape bằng blocklist dấu nháy, dấu chấm phẩy hay `$`; cú pháp đầy đủ của shell rộng hơn blocklist;
- dùng dữ liệu làm tên executable, option hoặc path mà không map và validate.

## Environment files và workflow commands

Runner cung cấp các file command như `GITHUB_ENV`, `GITHUB_OUTPUT`, `GITHUB_PATH` và `GITHUB_STATE`. Ghi vào các file này là giao tiếp với runner, không phải ghi text thuần. Mỗi dòng hoặc block có thể thay đổi môi trường và hành vi step sau.

### GITHUB_ENV không phải kênh dữ liệu tùy ý

Anti-pattern sau nguy hiểm với body nhiều dòng. Một newline trong `PR_BODY` có thể tạo thêm record trong environment file:

```yaml
# KHÔNG AN TOÀN — không chạy trong production.
- name: Persist arbitrary body
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  shell: bash
  run: printf 'PR_BODY=%s\n' "$PR_BODY" >> "$GITHUB_ENV"
```

Nếu chỉ step hiện tại cần dữ liệu, dùng step-level `env`; không cần ghi lại vào `GITHUB_ENV`. Nếu step sau cần một payload hoàn toàn tùy ý, GitHub Docs khuyến nghị ghi payload vào file thường thay vì dùng multiline delimiter có thể va chạm:

```yaml
- name: Persist arbitrary body as a file
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  shell: bash
  run: |
    set -euo pipefail
    umask 077
    body_file="${RUNNER_TEMP}/pr-body.txt"
    printf '%s' "$PR_BODY" > "$body_file"
    printf 'PR_BODY_FILE=%s\n' "$body_file" >> "$GITHUB_ENV"

- name: Read the file in a later step
  shell: bash
  run: |
    set -euo pipefail
    test "$PR_BODY_FILE" = "${RUNNER_TEMP}/pr-body.txt"
    wc -c < "$PR_BODY_FILE"
```

Giá trị ghi vào `GITHUB_ENV` ở đây là đường dẫn cố định do workflow tạo, không phải body của attacker.

Nếu giá trị đã được giới hạn thành một dòng với allowlist, có thể ghi trực tiếp:

```yaml
- name: Persist a validated channel
  env:
    CHANNEL_INPUT: ${{ inputs.channel }}
  shell: bash
  run: |
    set -euo pipefail
    case "$CHANNEL_INPUT" in
      stable|preview) ;;
      *) printf 'Channel không hợp lệ.\n' >&2; exit 1 ;;
    esac
    printf 'RELEASE_CHANNEL=%s\n' "$CHANNEL_INPUT" >> "$GITHUB_ENV"
```

Các quy tắc tương tự áp dụng cho `GITHUB_OUTPUT` và `GITHUB_PATH`. Đặc biệt, không thêm path do attacker kiểm soát vào `GITHUB_PATH`, vì executable giả có thể đứng trước tool thật ở step sau. Runner chặn ghi đè phần lớn biến `GITHUB_*`, `RUNNER_*` và chặn `NODE_OPTIONS` qua `GITHUB_ENV`, nhưng các chặn đó không biến file command thành kênh an toàn cho dữ liệu tùy ý.

### Ghi log dữ liệu không tin cậy

Workflow commands dùng cú pháp `::command::value` trên stdout. Một chuỗi không tin cậy bắt đầu bằng `::warning::`, `::error::`, `::add-mask::` hoặc workflow command khác có thể bị runner diễn giải thay vì hiển thị như text mong muốn.

Biện pháp tốt nhất là không log raw body, token hoặc toàn bộ `github` context. Log metadata đã tính toán như độ dài, hash không nhạy cảm hoặc kết quả validation:

```yaml
- name: Log metadata only
  env:
    PR_BODY: ${{ github.event.pull_request.body }}
  shell: bash
  run: printf 'PR body length=%s\n' "${#PR_BODY}"
```

Nếu bắt buộc log dữ liệu hoàn toàn không tin cậy để chẩn đoán, tạm dừng workflow command processing bằng token ngẫu nhiên riêng cho run, in dữ liệu, rồi bật lại.

### Dùng stop commands đúng cách

Bash trên GitHub-hosted Ubuntu có Python 3, nên có thể tạo UUID ngẫu nhiên:

```yaml
- name: Log untrusted text without workflow command parsing
  env:
    UNTRUSTED_LOG: ${{ github.event.comment.body }}
  shell: bash
  run: |
    set -euo pipefail
    stop_token="$(python3 -c 'import uuid; print(uuid.uuid4())')"
    printf '::stop-commands::%s\n' "$stop_token"
    printf '%s\n' "$UNTRUSTED_LOG"
    printf '::%s::\n' "$stop_token"
```

PowerShell dùng GUID mới:

```yaml
- name: Log untrusted text safely in PowerShell
  env:
    UNTRUSTED_LOG: ${{ github.event.comment.body }}
  shell: pwsh
  run: |
    $stopToken = [guid]::NewGuid().Guid
    Write-Output "::stop-commands::$stopToken"
    Write-Output $env:UNTRUSTED_LOG
    Write-Output "::$stopToken::"
```

Token phải ngẫu nhiên, khó đoán và duy nhất cho mỗi run. Không dùng hằng số như `END`, vì payload có thể chứa `::END::` để bật workflow commands trở lại.

<Callout type="warn" title="stop-commands không vô hiệu hóa shell">
  `stop-commands` chỉ bảo runner ngừng diễn giải workflow commands trên stdout. Nó không chống Bash, PowerShell, JavaScript hay tool khác thực thi dữ liệu. Vẫn phải truyền qua `env`, quote đúng và tránh API đánh giá chuỗi.
</Callout>

## Review và audit

### Review theo luồng dữ liệu

Review mỗi workflow theo chuỗi **source → transform → sink → privilege**:

1. Trigger nào khởi động workflow?
2. Field nào do contributor, người comment, caller hoặc job ít tin cậy kiểm soát?
3. Expression xuất hiện ở `env`, `with`, `run`, `script`, path hay option nào?
4. Dữ liệu có bị parse lần hai bởi shell, template engine, regex, JSON, YAML hoặc CLI không?
5. Job có token scope, secret, OIDC, network và runner nào?
6. Step sau có tin `GITHUB_ENV`, output, artifact hoặc file do step trước tạo không?
7. Với fork, workflow chạy code từ base, merge commit hay PR head?

Bảng audit tối thiểu:

| Workflow và job | Event | Source không tin cậy | Sink | Quyền và secrets | Kiểm soát |
|---|---|---|---|---|---|
| `triage.yml / label` | `pull_request_target` | title, body, labels, head ref | action input | `pull-requests: write` | action pin SHA, không checkout, validate |
| `ci.yml / test` | `pull_request` | code, commit, branch | build tools | `contents: read`, không secrets | GitHub-hosted runner, timeout |
| `release.yml / publish` | `push` tag | tag, commit message | CLI publish | token ghi | protected tag, env, allowlist version |

Kiểm tra cả composite action, local action, script shell, JavaScript, PowerShell và source của third-party action. Một workflow sạch vẫn có thể gọi action ghép input vào shell.

### CodeQL cho GitHub Actions

CodeQL hiện hỗ trợ GitHub Actions workflows như một ngôn ngữ phân tích. Với repository đủ điều kiện, bật **Settings → Advanced Security → CodeQL analysis → Default setup**, chỉnh cấu hình và bảo đảm **GitHub Actions** được chọn.

Query mặc định có độ chính xác rất cao:

```text
actions/code-injection/critical
```

Query này theo dõi input do người dùng kiểm soát đi vào các context như `run` hoặc `script`. Query mức medium nằm trong suite mở rộng:

```text
actions/code-injection/medium
```

Nếu threat model yêu cầu bao phủ rộng hơn, chọn query suite **security-extended** và review false positive. CodeQL Actions còn có query cho environment variable injection, PATH injection và untrusted checkout. Alert tự động là lớp phát hiện, không phải bằng chứng rằng mọi action tùy chỉnh, shell quoting hay luồng artifact đều an toàn.

<Callout type="idea" title="Ưu tiên default setup trước">
  GitHub hiện khuyến nghị bắt đầu bằng CodeQL default setup. Sau khi có baseline, mới chuyển sang advanced setup nếu cần query pack, lịch chạy hoặc cấu hình đặc biệt.
</Callout>

### Grep nhanh và giới hạn

Dùng `git grep` để tạo inventory ban đầu:

```bash
# Tìm expression lấy dữ liệu thường không tin cậy trong workflow.
git grep -nE '\$\{\{[^}]+(github\.event|github\.head_ref|inputs\.|steps\.|needs\.)' \
  -- '.github/workflows/*.yml' '.github/workflows/*.yaml'

# Tìm API hoặc shell thường tạo parse lần hai.
git grep -nE '(^|[^[:alnum:]_])(eval|Invoke-Expression|ScriptBlock\.Create)|\b(bash|sh|cmd)(\.exe)?[[:space:]]+/(c|C)|\b(bash|sh)[[:space:]]+-c\b|child_process\.(exec|execSync)' \
  -- .github scripts

# Tìm nơi ghi file command hoặc phát workflow command.
git grep -nE 'GITHUB_(ENV|OUTPUT|PATH|STATE)|::(add-mask|stop-commands|warning|error|notice)::' \
  -- .github scripts

# Tìm trigger cần review đặc biệt.
git grep -nE 'pull_request_target|workflow_run|issue_comment|repository_dispatch' \
  -- '.github/workflows/*.yml' '.github/workflows/*.yaml'
```

Các lệnh này có giới hạn rõ ràng:

- kết quả đầu tiên có cả cách dùng an toàn trong `env` và `with`;
- grep không hiểu YAML block, alias, reusable workflow hay data flow qua output;
- regex có thể bỏ sót expression xuống nhiều dòng, key động hoặc source được tạo lúc runtime;
- grep không đọc source action từ repository bên ngoài;
- không thể xác định permission hiệu lực, policy fork hoặc secret bằng một pattern đơn lẻ.

Vì vậy, dùng grep để **xếp hàng review**, CodeQL để theo dõi data flow đã mô hình hóa và review thủ công để xác nhận trust boundary. Không dùng số kết quả grep bằng 0 làm security gate duy nhất.

## Bài thực hành an toàn

Mục tiêu là chứng minh payload có cú pháp shell và workflow command vẫn là dữ liệu. Lab không chạy phiên bản dễ bị khai thác.

### Chuẩn bị

- Dùng repository thử nghiệm, không dùng production repository.
- Không cấu hình secret, PAT, OIDC hoặc self-hosted runner cho lab.
- File workflow có trên default branch để dùng `workflow_dispatch`.
- Giữ `permissions: {}` vì bài không cần API GitHub.

Payload mặc định chỉ cố tạo file marker trong thư mục tạm. Nếu workflow an toàn, file không bao giờ xuất hiện.

### Workflow phòng lab

Tạo `.github/workflows/script-injection-safe-lab.yml`:

```yaml
name: Script injection safe lab

on:
  workflow_dispatch:
    inputs:
      bash_sample:
        description: "Payload marker cho Bash"
        required: true
        type: string
        default: '$(touch "$RUNNER_TEMP/injection-marker")'
      pwsh_sample:
        description: "Payload marker cho PowerShell"
        required: true
        type: string
        default: '$(New-Item -ItemType File -Path "$env:RUNNER_TEMP/injection-marker")'
      log_sample:
        description: "Chuỗi giống workflow command"
        required: true
        type: string
        default: '::warning::UNTRUSTED_MARKER'

permissions: {}

jobs:
  bash-safe:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Consume payload as Bash data
        env:
          UNTRUSTED_TEXT: ${{ inputs.bash_sample }}
        shell: bash
        run: |
          set -euo pipefail
          marker="${RUNNER_TEMP}/injection-marker"
          rm -f "$marker"

          printf 'Payload length=%s\n' "${#UNTRUSTED_TEXT}"
          test ! -e "$marker"

      - name: Log payload with workflow commands stopped
        env:
          UNTRUSTED_LOG: ${{ inputs.log_sample }}
        shell: bash
        run: |
          set -euo pipefail
          stop_token="$(python3 -c 'import uuid; print(uuid.uuid4())')"
          printf '::stop-commands::%s\n' "$stop_token"
          printf '%s\n' "$UNTRUSTED_LOG"
          printf '::%s::\n' "$stop_token"

  powershell-safe:
    runs-on: windows-latest
    timeout-minutes: 5
    steps:
      - name: Consume payload as PowerShell data
        env:
          UNTRUSTED_TEXT: ${{ inputs.pwsh_sample }}
        shell: pwsh
        run: |
          Set-StrictMode -Version Latest
          $ErrorActionPreference = 'Stop'
          $marker = Join-Path $env:RUNNER_TEMP 'injection-marker'
          Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue

          Write-Output "Payload length=$($env:UNTRUSTED_TEXT.Length)"
          if (Test-Path -LiteralPath $marker) {
            throw 'Payload đã bị thực thi ngoài dự kiến.'
          }

      - name: Log payload with workflow commands stopped
        env:
          UNTRUSTED_LOG: ${{ inputs.log_sample }}
        shell: pwsh
        run: |
          $stopToken = [guid]::NewGuid().Guid
          Write-Output "::stop-commands::$stopToken"
          Write-Output $env:UNTRUSTED_LOG
          Write-Output "::$stopToken::"
```

Lab không checkout source, không gọi mạng và không đưa input vào executable hay option. Payload chỉ đi từ expression tới step-level `env`, sau đó được đọc bằng cú pháp runtime của từng shell.

### Payload và tiêu chí kiểm chứng

Chạy bằng giao diện **Actions → Script injection safe lab → Run workflow**, hoặc GitHub CLI:

```bash
gh workflow run script-injection-safe-lab.yml
gh run watch
gh run view --log
```

Thử thêm ba giá trị không phá hủy:

```text
docs: quote " và khoảng trắng
$(printf INJECTION_MARKER)
::error::UNTRUSTED_MARKER
```

Hoàn thành bài khi:

- cả hai job thành công với payload mặc định;
- không có file `injection-marker` trong thư mục tạm;
- log chỉ in độ dài cho payload shell;
- `UNTRUSTED_MARKER` xuất hiện như text, không tạo warning hay error annotation;
- `permissions` của job là rỗng và không có secret;
- source workflow không chứa `${{ inputs.* }}` bên trong bất kỳ block `run` nào;
- token cho `stop-commands` khác nhau giữa các lần chạy.

<Callout type="error" title="Không thêm ca dễ bị khai thác vào workflow lab đã commit">
  Đừng tạo một job “so sánh” bằng cách nội suy payload trực tiếp vào `run`. Chỉ cần review anti-pattern trong tài liệu. Việc giữ workflow cố ý dễ bị khai thác trên default branch có thể tạo đường tấn công về sau khi permissions hoặc secrets thay đổi.
</Callout>

## Best practices cho production

- Coi `github.event.*`, `github.head_ref`, dispatch inputs, outputs và artifact từ job ít tin cậy là dữ liệu không tin cậy.
- Không nhúng context không tin cậy trực tiếp vào `run`, `script`, command string hoặc template thực thi.
- Ưu tiên action hay chương trình đã review nhận dữ liệu qua `with`, environment hoặc argument.
- Với inline script, đặt expression ở `env` và đọc bằng `"$NAME"` trong Bash hoặc `$env:NAME` trong PowerShell.
- Không đọc lại biến bằng `${{ env.NAME }}` bên trong `run`; cách đó vẫn nội suy source.
- Đặt `shell` tường minh. Không áp dụng quy tắc quote của Bash cho PowerShell hay `cmd.exe`.
- Loại bỏ `eval`, `Invoke-Expression`, `cmd /c`, `shell=True` và API `exec` nhận command string.
- Dùng allowlist và map enum sang command, option, environment, host hoặc đường dẫn tĩnh.
- Không ghi raw body hay dữ liệu nhiều dòng tùy ý vào `GITHUB_ENV`, `GITHUB_OUTPUT` hoặc `GITHUB_PATH`; dùng file thường khi delimiter không thể bảo đảm duy nhất.
- Không log raw payload nếu không cần. Khi bắt buộc, dùng `stop-commands` với token UUID ngẫu nhiên cho mỗi run.
- Đặt `permissions: {}` ở cấp workflow rồi mở đúng scope tại job cần dùng.
- Không cấp secrets, OIDC hoặc token ghi cho job xử lý code và metadata từ fork.
- Dùng `pull_request` cho CI từ fork. Chỉ dùng `pull_request_target` cho metadata tin cậy về code và tuyệt đối không chạy PR head.
- Pin action ngoài repository bằng full commit SHA đã xác minh và review cách action xử lý input.
- Bảo vệ `.github/workflows/`, `.github/actions/` và script automation bằng `CODEOWNERS` cùng required review.
- Bật CodeQL scanning cho GitHub Actions; cân nhắc suite `security-extended` cho repository rủi ro cao.
- Dùng GitHub-hosted runner cho code không tin cậy. Self-hosted runner phải ephemeral, cô lập mạng và không chứa credential tồn dư.
- Kiểm thử cả input hợp lệ, dấu nháy, multiline, command marker và chuỗi giống workflow command trong repository lab.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý an toàn |
|---|---|---|
| PR title có dấu nháy làm step lỗi cú pháp | title được nội suy trực tiếp vào `run` hoặc `script` | chuyển expression sang `env`, đọc bằng cú pháp shell runtime |
| Đã dùng `env` nhưng CodeQL vẫn báo injection | script đọc `${{ env.NAME }}` thay vì `$NAME` hoặc `$env:NAME` | giữ expression chỉ ở map `env`; sửa source script thành biến runtime |
| Bash tách title thành nhiều đối số | dùng `$PR_TITLE` không có nháy kép | dùng `"$PR_TITLE"`; thêm `--` trước dữ liệu khi CLI hỗ trợ |
| PowerShell in nguyên `$PR_TITLE` | dùng cú pháp Bash hoặc nháy đơn | đọc `$env:PR_TITLE`; dùng call operator với argument riêng |
| Payload trong biến vẫn chạy | script dùng `eval`, `bash -c`, `Invoke-Expression` hoặc parser thứ hai | loại bỏ parse lần hai; dùng API argument array và `shell: false` |
| Dòng `::warning::...` tạo annotation ngoài ý muốn | raw payload được in khi workflow commands đang bật | không log raw; hoặc bọc bằng `stop-commands` với token ngẫu nhiên |
| Payload bật lại workflow commands | token stop cố định hoặc đoán được | tạo UUID mới mỗi run và không đưa token vào nguồn attacker kiểm soát |
| Step sau có environment variable lạ | dữ liệu multiline được ghép thẳng vào `GITHUB_ENV` | lưu payload trong file thường; chỉ ghi path cố định hoặc giá trị đã allowlist |
| Executable giả được gọi ở step sau | path không tin cậy được thêm vào `GITHUB_PATH` | chỉ thêm thư mục do workflow tin cậy tạo; không dùng path từ payload hoặc artifact |
| CodeQL không thấy workflow | GitHub Actions chưa được chọn trong default setup hoặc repository không đủ điều kiện | chỉnh CodeQL configuration, kiểm Tool status và eligibility của code scanning |
| Grep không có kết quả nhưng alert vẫn xuất hiện | regex bỏ sót multiline, reusable workflow hoặc data flow qua output | tin data-flow analysis và review call chain; không dùng grep làm bằng chứng duy nhất |
| Fork PR không có secrets | hành vi bảo vệ dự kiến của `pull_request` | giữ CI không đặc quyền; chuyển tác vụ cần secret sang post-merge hoặc environment approval |
| `pull_request_target` checkout PR bị chặn | bảo vệ của `actions/checkout` v7 trở lên phát hiện fork ref nguy hiểm | không tắt bảo vệ để chạy CI; đổi sang `pull_request` hoặc chỉ xử lý metadata base-side |
| Validation từ chối branch hợp lệ của Git | allowlist nội bộ cố ý chặt hơn grammar Git ref | quyết định convention mong muốn; nới regex có review, không bỏ ranh giới dữ liệu |
| Output JSON lỗi với label hoặc body đặc biệt | tự ghép JSON bằng string | dùng `toJSON` ở `env`, parser JSON chuẩn và kiểm schema |

## Bài bảo mật liên quan

<Cards>
  <Card title="GITHUB_TOKEN và permissions" href="/docs/bao-mat/01-github-token-permissions/" description="Giảm blast radius nếu một step bị chiếm quyền." />
  <Card title="Third-party actions" href="/docs/bao-mat/04-third-party-actions/" description="Review source, pin SHA và kiểm cách action xử lý input." />
  <Card title="Fork pull requests" href="/docs/bao-mat/06-fork-pull-requests/" description="Thiết kế trust boundary cho contribution từ fork." />
  <Card title="Contexts" href="/docs/nen-tang/07-contexts/" description="Hiểu nguồn dữ liệu, availability và thời điểm expression được đánh giá." />
</Cards>

## Tài liệu tham khảo chính thức

Các nguồn dưới đây được đối chiếu với tài liệu hiện hành năm 2026:

- [GitHub Docs — Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Docs — Workflow commands for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- [GitHub Docs — Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [GitHub Docs — Expressions reference](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)
- [GitHub Docs — Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub Docs — Securely using pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
- [GitHub Docs — Code scanning with CodeQL](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql)
- [GitHub Docs — Configuring default setup for code scanning](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configure-code-scanning)
- [CodeQL query help — Code injection critical](https://codeql.github.com/codeql-query-help/actions/actions-code-injection-critical/)
- [CodeQL query help — Code injection medium](https://codeql.github.com/codeql-query-help/actions/actions-code-injection-medium/)
- [GitHub Security Lab — Keeping your GitHub Actions and workflows secure: Untrusted input](https://securitylab.github.com/resources/github-actions-untrusted-input/)
- [GitHub Security Lab — Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
