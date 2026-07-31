---
title: "Contexts"
description: "Hiểu các object dữ liệu của GitHub Actions, thời điểm chúng khả dụng và cách dùng an toàn trong workflow."
---

<Callout type="info" title="Mục tiêu của bài">
  Sau bài này, bạn có thể chọn đúng context cho từng vị trí trong workflow, phân biệt expression do GitHub Actions xử lý với biến môi trường do shell đọc, truyền dữ liệu không tin cậy vào script an toàn hơn và kiểm chứng dữ liệu bằng một workflow chạy được.
</Callout>

## Mục lục

- [Mô hình tinh thần](#mô-hình-tinh-thần)
  - [Context là object dữ liệu](#context-là-object-dữ-liệu)
  - [Đánh giá ở GitHub và shell trên runner](#đánh-giá-ở-github-và-shell-trên-runner)
  - [Contexts khác biến môi trường mặc định](#contexts-khác-biến-môi-trường-mặc-định)
- [Cú pháp truy cập](#cú-pháp-truy-cập)
  - [Property và index](#property-và-index)
  - [Chọn context thay vì ghi cứng](#chọn-context-thay-vì-ghi-cứng)
- [Khả dụng theo vị trí và thời điểm](#khả-dụng-theo-vị-trí-và-thời-điểm)
  - [Đọc bảng khả dụng theo workflow key](#đọc-bảng-khả-dụng-theo-workflow-key)
  - [Vòng đời của dữ liệu](#vòng-đời-của-dữ-liệu)
- [Các context thường dùng](#các-context-thường-dùng)
  - [Dữ liệu run với github](#dữ-liệu-run-với-github)
  - [Cấu hình với env vars và secrets](#cấu-hình-với-env-vars-và-secrets)
  - [Trạng thái thực thi với runner job và steps](#trạng-thái-thực-thi-với-runner-job-và-steps)
  - [Luồng giữa job với matrix strategy và needs](#luồng-giữa-job-với-matrix-strategy-và-needs)
  - [Đầu vào với inputs](#đầu-vào-với-inputs)
  - [Context jobs trong reusable workflow](#context-jobs-trong-reusable-workflow)
- [Workflow mẫu hoàn chỉnh](#workflow-mẫu-hoàn-chỉnh)
  - [Mục tiêu của workflow](#mục-tiêu-của-workflow)
  - [File context-lab.yml](#file-context-labyml)
  - [Theo dõi dữ liệu đi qua workflow](#theo-dõi-dữ-liệu-đi-qua-workflow)
- [Debug context bằng toJSON](#debug-context-bằng-tojson)
  - [Dùng toJSON có chọn lọc](#dùng-tojson-có-chọn-lọc)
  - [Không dump toàn bộ github hoặc secrets](#không-dump-toàn-bộ-github-hoặc-secrets)
- [Bảo mật dữ liệu từ context](#bảo-mật-dữ-liệu-từ-context)
  - [Nhận diện input không tin cậy](#nhận-diện-input-không-tin-cậy)
  - [Truyền qua biến môi trường trung gian](#truyền-qua-biến-môi-trường-trung-gian)
- [Thực hành và kiểm chứng](#thực-hành-và-kiểm-chứng)
  - [Chuẩn bị](#chuẩn-bị)
  - [Chạy hai trường hợp](#chạy-hai-trường-hợp)
  - [Tiêu chí hoàn thành](#tiêu-chí-hoàn-thành)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Bước tiếp theo](#bước-tiếp-theo)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Mô hình tinh thần

### Context là object dữ liệu

Một **context** là một object chứa dữ liệu mà GitHub Actions cung cấp cho một lần chạy workflow. Ví dụ, `github` chứa thông tin về repository và sự kiện; `runner` mô tả máy đang chạy job; `needs` chứa kết quả từ các job phụ thuộc trực tiếp.

Bạn đọc một thuộc tính của object trong expression `${{ ... }}`:

```yaml
run-name: CI ${{ github.repository }} @ ${{ github.ref_name }}
```

Ở đây, `github` là context còn `repository` và `ref_name` là các thuộc tính. Nội dung thật phụ thuộc vào event, job, step và thời điểm đánh giá. Vì vậy, không nên xem context như một dictionary toàn cục có mọi khóa ở mọi nơi.

```text
Event và cấu hình workflow
          │
          ▼
GitHub Actions tạo các context ban đầu
          │
          ├── đánh giá run-name, concurrency, job.if, matrix, runs-on...
          │
          ▼
Job được gán cho runner
          │
          ├── xuất hiện dữ liệu runner/job và biến môi trường mặc định
          │
          ▼
Các step chạy tuần tự
          └── steps chỉ chứa step có id và đã chạy
```

### Đánh giá ở GitHub và shell trên runner

Workflow có hai lớp xử lý dễ bị nhầm:

1. **Server-side workflow evaluation (đánh giá phía GitHub):** GitHub Actions đọc `${{ context.property }}` để dựng run, chọn job hoặc chuẩn bị giá trị cho step. Các khóa như `jobs.<job_id>.if` được đánh giá trước khi job được gửi tới runner. Vì vậy, biến môi trường mặc định của runner chưa tồn tại ở giai đoạn này.
2. **Runner-side shell execution (shell trên runner):** sau khi job được gán, runner chạy `run` bằng shell. Bash đọc `$NAME`, PowerShell đọc `$env:NAME`, còn `cmd.exe` đọc `%NAME%`. Expression ở step được nội suy khi runner chuẩn bị step, rồi shell mới thực thi nội dung đã nhận.

Hai lớp này không phải hai cú pháp thay thế cho nhau. `${{ github.ref }}` là expression của Actions; `$GITHUB_REF` là biến môi trường mà shell trên runner đọc.

Ví dụ sau cố ý dùng cả hai lớp:

```yaml
jobs:
  production:
    if: ${{ github.ref == 'refs/heads/main' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Ref trên runner là $GITHUB_REF"
```

`github.ref` giúp GitHub quyết định có tạo job `production` hay không. Nếu điều kiện đúng, shell trên runner mới chạy và đọc biến môi trường mặc định `GITHUB_REF`.

<Callout type="idea" title="Quy tắc chọn nhanh">
  Dùng context khi cấu hình một workflow key hoặc điều kiện. Trong script `run`, ưu tiên truyền giá trị cần thiết qua `env`, rồi để shell đọc biến môi trường và luôn quote biến đó.
</Callout>

### Contexts khác biến môi trường mặc định

| Khái niệm | Nơi tồn tại | Cách đọc | Ví dụ |
|---|---|---|---|
| Context | Lớp xử lý workflow của GitHub Actions; mức khả dụng tùy workflow key | `${{ github.ref }}` | Dùng trong `if`, `runs-on`, `name`, `env` và các khóa được hỗ trợ |
| Biến khai báo bằng `env` | Context `env` và môi trường process theo phạm vi workflow/job/step | `${{ env.APP_NAME }}` hoặc `$APP_NAME` | Cấu hình tạm thời trong một workflow |
| Biến mặc định | Môi trường process trên runner | `$GITHUB_REF`, `$RUNNER_OS` | Metadata do GitHub tạo cho mỗi step |

Các biến mặc định như `GITHUB_REF` và `RUNNER_OS` **không nằm trong context `env`**, vì bạn không khai báo chúng bằng khóa `env`. Phần lớn có thuộc tính context tương ứng, chẳng hạn `github.ref` và `runner.os`. Bạn cũng không thể ghi đè các biến mặc định bắt đầu bằng `GITHUB_` hoặc `RUNNER_`.

## Cú pháp truy cập

### Property và index

GitHub Actions hỗ trợ hai dạng truy cập:

```yaml
env:
  REPOSITORY_A: ${{ github.repository }}
  REPOSITORY_B: ${{ github['repository'] }}
```

- **Property dereference** (`github.repository`) ngắn và dễ đọc. Tên thuộc tính phải bắt đầu bằng chữ cái hoặc `_`, sau đó chỉ chứa chữ, số, `-` hoặc `_`.
- **Index syntax** (`github['repository']`) phù hợp với khóa động, khóa khó đọc bằng dấu chấm hoặc chỉ số số.

Ví dụ cổng service container dùng khóa số:

```yaml
- name: Kiểm tra PostgreSQL
  run: pg_isready -h localhost -p "${{ job.services.postgres.ports[5432] }}"
```

Ví dụ một khóa matrix có dấu gạch nối:

```yaml
strategy:
  matrix:
    node-version: [20, 22]
steps:
  - run: echo "Node ${{ matrix['node-version'] }}"
```

Nếu thuộc tính không tồn tại, phép dereference thường cho chuỗi rỗng. Điều này có thể che giấu lỗi chính tả. Chẳng hạn `${{ github.repositry }}` không báo tên repository như mong đợi mà có thể trở thành `''`.

### Chọn context thay vì ghi cứng

| Nhu cầu | Context phù hợp | Ví dụ |
|---|---|---|
| Biết event, ref, repository hoặc actor | `github` | `${{ github.event_name }}` |
| Dùng cấu hình khai báo ngay trong workflow | `env` | `${{ env.APP_NAME }}` |
| Dùng cấu hình quản trị ngoài file workflow | `vars` | `${{ vars.DEPLOY_REGION }}` |
| Truyền thông tin nhạy cảm | `secrets` | `${{ secrets.REGISTRY_TOKEN }}` |
| Chọn theo từng bản sao matrix | `matrix` | `${{ matrix.os }}` |
| Đọc output của step trước | `steps` | `${{ steps.meta.outputs.version }}` |
| Đọc output hoặc kết quả job trước | `needs` | `${{ needs.build.outputs.version }}` |
| Đọc tham số chạy thủ công hoặc reusable workflow | `inputs` | `${{ inputs.environment }}` |

Bảng này là điểm bắt đầu, không thay thế bảng **Context availability** chính thức. Cùng một context có thể hợp lệ ở `steps.run` nhưng không hợp lệ ở `run-name` hoặc `jobs.<job_id>.if`.

## Khả dụng theo vị trí và thời điểm

### Đọc bảng khả dụng theo workflow key

GitHub xác định context hợp lệ theo **từng workflow key**, không chỉ theo cấp workflow/job/step. Một số vị trí thường gặp:

| Workflow key | Context đáng chú ý có thể dùng | Hệ quả thực tế |
|---|---|---|
| `run-name` | `github`, `inputs`, `vars` | Chưa có `runner`, `job`, `steps` hoặc `needs` |
| `env` cấp workflow | `github`, `secrets`, `inputs`, `vars` | Có thể ánh xạ cấu hình vào môi trường các job |
| `jobs.<job_id>.if` | `github`, `needs`, `vars`, `inputs` | Không dùng trực tiếp `secrets`, `matrix` hoặc `runner` tại đây |
| `jobs.<job_id>.strategy` | `github`, `needs`, `vars`, `inputs` | Có thể dựng matrix từ output job trước |
| `jobs.<job_id>.runs-on` | `github`, `needs`, `strategy`, `matrix`, `vars`, `inputs` | Có thể chọn runner bằng từng giá trị matrix |
| `jobs.<job_id>.steps.if` | `github`, `needs`, `strategy`, `matrix`, `job`, `runner`, `env`, `vars`, `steps`, `inputs` | Không tham chiếu trực tiếp `secrets` trong điều kiện |
| `jobs.<job_id>.steps.run` | Tất cả context thông dụng, gồm `secrets` | Expression được nội suy trước khi shell thực thi lệnh |

<Callout type="warn" title="Đừng suy đoán từ một ví dụ chạy được">
  Việc `${{ runner.os }}` hoạt động trong một step không có nghĩa nó hoạt động trong `run-name`. Khi chuyển expression sang workflow key khác, hãy kiểm tra bảng Context availability của GitHub.
</Callout>

### Vòng đời của dữ liệu

Khả dụng còn phụ thuộc vào dữ liệu đã được tạo hay chưa:

- `github` có sớm nhất, nhưng một số thuộc tính do runner đặt như `github.job` và `github.token` chỉ có trong lúc thực thi step.
- `runner` và `job` có ý nghĩa sau khi job được gán và bắt đầu chạy.
- `steps` chỉ chứa các step có `id` và **đã chạy** trong cùng job. Step hiện tại không thể đọc output tương lai.
- `needs` chỉ chứa job được liệt kê là dependency **trực tiếp** bằng `needs`. Nó không tự bao gồm dependency bắc cầu.
- `matrix` và `strategy` chỉ có cho job dùng chiến lược matrix, sau khi tổ hợp hiện tại được tạo.
- `inputs` chỉ có dữ liệu được định nghĩa bởi `workflow_dispatch` hoặc `workflow_call`.
- `jobs` chỉ dành cho reusable workflow và chỉ dùng để ánh xạ output của reusable workflow.
- `env` thay đổi theo phạm vi. Giá trị cấp step ghi đè cấp job; cấp job ghi đè cấp workflow trong thời gian phạm vi đó chạy.

Nói ngắn gọn: trước khi dùng một thuộc tính, hãy hỏi cả **“workflow key này cho phép context nào?”** và **“dữ liệu này đã tồn tại chưa?”**.

## Các context thường dùng

### Dữ liệu run với github

`github` mô tả lần chạy và webhook event đã kích hoạt nó.

| Thuộc tính | Ý nghĩa | Ví dụ giá trị |
|---|---|---|
| `github.repository` | Repository dạng `owner/name` | `octocat/hello-world` |
| `github.ref` | Ref đầy đủ | `refs/heads/main` |
| `github.ref_name` | Tên ref ngắn | `main` |
| `github.sha` | Commit SHA gắn với event | `ffac537...` |
| `github.event_name` | Tên event | `push`, `pull_request` |
| `github.event` | Toàn bộ webhook payload | Object thay đổi theo event |
| `github.run_id` | ID duy nhất của run | `1658821493` |

```yaml
- name: Ghi metadata của run
  env:
    REPOSITORY: ${{ github.repository }}
    REF_NAME: ${{ github.ref_name }}
    COMMIT_SHA: ${{ github.sha }}
  run: printf 'repo=%s ref=%s sha=%s\n' "$REPOSITORY" "$REF_NAME" "$COMMIT_SHA"
```

`github.event` thay đổi mạnh theo trigger. `github.event.pull_request.title` tồn tại với event pull request nhưng không tồn tại với một push thông thường. Hãy kiểm tra tài liệu payload của event trước khi dùng đường dẫn sâu.

### Cấu hình với env vars và secrets

Ba context này đều có thể cung cấp chuỗi cho workflow, nhưng mục đích khác nhau:

| Context | Nguồn dữ liệu | Dùng cho | Lưu ý |
|---|---|---|---|
| `env` | Khóa `env` ở workflow, job hoặc step | Cấu hình cục bộ và biến trung gian cho shell | Không chứa biến process được runner kế thừa |
| `vars` | Configuration variables ở organization, repository hoặc environment | Giá trị không nhạy cảm dùng lại qua nhiều workflow | Khóa chưa cấu hình trả về chuỗi rỗng |
| `secrets` | Actions secrets và `GITHUB_TOKEN` tự động | Token, password, credential | Không in ra log; không dùng trực tiếp trong `if` |

```yaml
env:
  APP_NAME: context-demo

jobs:
  example:
    runs-on: ubuntu-latest
    env:
      LOG_LEVEL: ${{ vars.LOG_LEVEL || 'info' }}
    steps:
      - name: Dùng cấu hình và token
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          echo "Ứng dụng: $APP_NAME"
          echo "Log level: $LOG_LEVEL"
          test -n "$GH_TOKEN"
```

Ví dụ chỉ kiểm tra token có mặt; nó không in giá trị. Cách tạo variable, phân quyền secret và cơ chế precedence đầy đủ được trình bày ở các bài chuyên biệt, không phải phạm vi chính của bài này.

### Trạng thái thực thi với runner job và steps

| Context | Dữ liệu tiêu biểu | Ví dụ |
|---|---|---|
| `runner` | OS, kiến trúc, tên runner, thư mục tạm | `${{ runner.os }}`, `${{ runner.temp }}` |
| `job` | Trạng thái job, container và service ports | `${{ job.status }}` |
| `steps` | Output, `outcome`, `conclusion` của step có `id` đã chạy | `${{ steps.test.outcome }}` |

```yaml
steps:
  - name: Tạo output
    id: meta
    run: echo "channel=stable" >> "$GITHUB_OUTPUT"

  - name: Đọc trạng thái runtime
    env:
      OS: ${{ runner.os }}
      CHANNEL: ${{ steps.meta.outputs.channel }}
      META_RESULT: ${{ steps.meta.conclusion }}
      JOB_STATUS: ${{ job.status }}
    run: printf '%s | %s | %s | %s\n' "$OS" "$CHANNEL" "$META_RESULT" "$JOB_STATUS"
```

`steps.meta.outcome` là kết quả trước khi áp dụng `continue-on-error`; `steps.meta.conclusion` là kết quả sau khi áp dụng. Hai giá trị có thể khác nhau khi một step lỗi nhưng được phép tiếp tục.

### Luồng giữa job với matrix strategy và needs

| Context | Phạm vi | Dữ liệu tiêu biểu |
|---|---|---|
| `matrix` | Từng bản sao của job matrix | Các khóa bạn tự định nghĩa như `os`, `node` hoặc `mode` |
| `strategy` | Job matrix hiện tại | `fail-fast`, `job-index`, `job-total`, `max-parallel` |
| `needs` | Job có dependency trực tiếp | `result` và `outputs` của từng job trong `needs` |

```yaml
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.meta.outputs.version }}
    steps:
      - id: meta
        run: echo "version=1.2.3" >> "$GITHUB_OUTPUT"

  test:
    needs: prepare
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - run: echo "Testing ${{ needs.prepare.outputs.version }} on ${{ runner.os }}"
```

Trong `test`, `matrix.os` khác nhau giữa các bản sao. `needs.prepare.outputs.version` giống nhau vì cả hai đều phụ thuộc trực tiếp vào `prepare`.

### Đầu vào với inputs

`inputs` giữ kiểu `boolean`, `number` hoặc `string` cho reusable workflow. Với `workflow_dispatch`, input còn có thể được khai báo dạng `choice` hoặc `environment`; giá trị `choice` vẫn là chuỗi đã chọn.

```yaml
on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Chỉ mô phỏng"
        required: true
        type: boolean
        default: true

jobs:
  deploy:
    if: ${{ inputs.dry_run == false }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Triển khai thật"
```

Dùng `inputs.dry_run` giữ giá trị boolean. Biến tương ứng trong `github.event.inputs` biểu diễn giá trị dưới dạng chuỗi, nên `inputs` thường rõ kiểu hơn.

### Context jobs trong reusable workflow

`jobs` không phải phiên bản số nhiều dùng được ở mọi workflow. Nó chỉ có trong reusable workflow và chỉ được dùng để ánh xạ job output lên output của `workflow_call`:

```yaml
on:
  workflow_call:
    outputs:
      artifact_name:
        description: "Tên artifact do workflow tạo"
        value: ${{ jobs.build.outputs.artifact_name }}
```

Trong workflow gọi, output đó được đọc qua `needs.<caller_job_id>.outputs`. Nội dung reusable workflow được trình bày sâu hơn ở bài riêng; điều quan trọng tại đây là không nhầm `jobs` với `job` hoặc `needs`.

## Workflow mẫu hoàn chỉnh

### Mục tiêu của workflow

Workflow dưới đây dùng context theo một luồng có thể quan sát:

1. `prepare` tạo output từ `github` và `env`.
2. `test` tạo hai bản sao từ `matrix`, rồi nhận output bằng `needs`.
3. `summarize` đọc kết quả của hai job phụ thuộc.
4. Khi chạy thủ công với `verbose: true`, workflow debug một số context không nhạy cảm bằng `toJSON`.

Workflow không cần checkout mã nguồn hoặc cài dependency, nên có thể chạy trong repository bất kỳ.

### File context-lab.yml

Tạo `.github/workflows/context-lab.yml`:

```yaml
name: Context Lab
run-name: Context Lab · ${{ github.ref_name }} · ${{ inputs.target || 'test' }}

on:
  push:
  workflow_dispatch:
    inputs:
      target:
        description: "Môi trường mô phỏng"
        required: true
        type: choice
        options:
          - test
          - staging
        default: test
      verbose:
        description: "In các context không nhạy cảm"
        required: true
        type: boolean
        default: false

permissions:
  contents: read

env:
  APP_NAME: context-demo

jobs:
  prepare:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      build_label: ${{ steps.meta.outputs.build_label }}
    steps:
      - name: Tạo metadata
        id: meta
        env:
          REF_NAME: ${{ github.ref_name }}
        run: |
          build_label="${APP_NAME}-${REF_NAME}-${GITHUB_RUN_NUMBER}"
          echo "build_label=$build_label" >> "$GITHUB_OUTPUT"

      - name: Hiển thị dữ liệu đã chọn
        env:
          EVENT_NAME: ${{ github.event_name }}
          REPOSITORY: ${{ github.repository }}
          TARGET: ${{ inputs.target || 'test' }}
          LOG_LEVEL: ${{ vars.LOG_LEVEL || 'info' }}
        run: |
          printf 'event=%s\nrepo=%s\ntarget=%s\nlog=%s\n' \
            "$EVENT_NAME" "$REPOSITORY" "$TARGET" "$LOG_LEVEL"

      - name: Kiểm tra token mà không in giá trị
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          test -n "$GH_TOKEN"
          echo "GITHUB_TOKEN đã được cấp với permissions đã khai báo."

      - name: Debug context đã chọn
        if: ${{ inputs.verbose == true }}
        env:
          RUNNER_JSON: ${{ toJSON(runner) }}
          JOB_JSON: ${{ toJSON(job) }}
          STEPS_JSON: ${{ toJSON(steps) }}
        run: |
          printf 'runner=%s\n' "$RUNNER_JSON"
          printf 'job=%s\n' "$JOB_JSON"
          printf 'steps=%s\n' "$STEPS_JSON"

  test:
    needs: prepare
    runs-on: ubuntu-latest
    timeout-minutes: 5
    name: Test ${{ matrix.mode }} · index ${{ strategy.job-index }} of ${{ strategy.job-total }}
    strategy:
      fail-fast: false
      matrix:
        mode: [debug, release]
    steps:
      - name: Quan sát matrix và output job trước
        env:
          MODE: ${{ matrix.mode }}
          BUILD_LABEL: ${{ needs.prepare.outputs.build_label }}
          TARGET: ${{ inputs.target || 'test' }}
        run: |
          printf 'mode=%s label=%s target=%s runner=%s\n' \
            "$MODE" "$BUILD_LABEL" "$TARGET" "$RUNNER_OS"

      - name: Kiểm tra nhánh release của matrix
        if: ${{ matrix.mode == 'release' && needs.prepare.result == 'success' }}
        run: echo "Nhánh release chỉ chạy sau khi prepare thành công."

  summarize:
    needs: [prepare, test]
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Tổng hợp kết quả dependency trực tiếp
        env:
          PREPARE_RESULT: ${{ needs.prepare.result }}
          TEST_RESULT: ${{ needs.test.result }}
        run: printf 'prepare=%s test=%s\n' "$PREPARE_RESULT" "$TEST_RESULT"
```

Workflow hợp lệ cho cả `push` và `workflow_dispatch`. Với `push`, `inputs.target` không được cung cấp nên toán tử `||` chọn `test`; với lần chạy thủ công, giá trị được lấy từ form.

### Theo dõi dữ liệu đi qua workflow

| Dữ liệu | Nơi tạo | Nơi đọc |
|---|---|---|
| Tên ref | `github.ref_name` | Step `meta` qua biến `REF_NAME` |
| Nhãn build | Step `meta` ghi vào `$GITHUB_OUTPUT` | Job output `prepare`, rồi `needs.prepare.outputs.build_label` |
| Chế độ test | `strategy.matrix.mode` | Từng bản sao job qua `matrix.mode` |
| Kết quả job | GitHub Actions kết luận job | `needs.prepare.result` và `needs.test.result` |
| OS của runner | Runner cung cấp | Context `runner` khi debug và `$RUNNER_OS` trong shell |

Lưu ý `strategy.job-index` bắt đầu từ `0`, còn `strategy.job-total` là tổng số job và không bắt đầu từ `0`. Với hai mode, index lần lượt là `0` và `1`, còn total là `2`.

## Debug context bằng toJSON

### Dùng toJSON có chọn lọc

`toJSON(value)` chuyển object thành JSON dễ đọc. Vì context là object, lệnh sau hữu ích hơn việc cố `echo` trực tiếp object:

```yaml
- name: Debug matrix
  env:
    MATRIX_JSON: ${{ toJSON(matrix) }}
  run: printf '%s\n' "$MATRIX_JSON"
```

Ưu tiên dump context nhỏ như `matrix`, `strategy`, `runner` hoặc một nhánh event cụ thể. Tốt hơn nữa, chỉ in thuộc tính đang điều tra:

```yaml
- name: Debug event tối thiểu
  env:
    EVENT_NAME: ${{ github.event_name }}
    REF_NAME: ${{ github.ref_name }}
  run: printf 'event=%s ref=%s\n' "$EVENT_NAME" "$REF_NAME"
```

### Không dump toàn bộ github hoặc secrets

<Callout type="error" title="Context có thể chứa dữ liệu nhạy cảm">
  Toàn bộ `github` chứa `github.token`, tương đương `GITHUB_TOKEN` trong lúc chạy step. Không dump `toJSON(github)` trong workflow dùng thật và tuyệt đối không dump `toJSON(secrets)`.
</Callout>

GitHub cố che các secret đã đăng ký khi chúng xuất hiện trong log, nhưng masking không phải ranh giới bảo mật tuyệt đối. Giá trị đã biến đổi, encode hoặc ghép vào dữ liệu khác có thể không được che như mong đợi. Log và artifact cũng có thời gian lưu giữ, nên “đã bị mask” không phải lý do để chủ động in secret.

Nếu một secret lộ ra không được che, hãy xóa log liên quan và rotate credential ngay. Đừng chỉ sửa workflow rồi giữ credential cũ.

## Bảo mật dữ liệu từ context

### Nhận diện input không tin cậy

Dữ liệu trong context không mặc nhiên đáng tin. Người mở issue hoặc pull request có thể kiểm soát title, body, branch name, commit message và nhiều trường trong `github.event`. Input chạy thủ công cũng là dữ liệu bên ngoài script.

Đoạn sau nguy hiểm vì GitHub chèn title trực tiếp vào nội dung script trước khi Bash phân tích:

```yaml
# Không dùng
- name: Kiểm tra tiêu đề PR
  run: |
    title="${{ github.event.pull_request.title }}"
    [[ "$title" == feat:* ]]
```

Một title được tạo có chủ đích có thể đóng dấu nháy và thêm lệnh shell. Quote nằm trong template script không đủ bảo vệ sau khi expression đã được thay bằng chuỗi của kẻ tấn công.

### Truyền qua biến môi trường trung gian

Với inline script, truyền dữ liệu context vào `env`, rồi quote biến shell:

```yaml
- name: Kiểm tra tiêu đề PR an toàn hơn
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: |
    if [[ "$PR_TITLE" == feat:* ]]; then
      echo "Tiêu đề dùng prefix feat:"
    else
      echo "Tiêu đề không dùng prefix feat:"
      exit 1
    fi
```

Giá trị title trở thành dữ liệu trong environment thay vì một phần mã nguồn script được sinh ra. `"$PR_TITLE"` còn tránh word splitting và glob expansion trong Bash.

Cách mạnh hơn là dùng một action nhận giá trị qua `with` và xử lý nó như argument thay vì tự tạo inline script. Dù chọn cách nào, vẫn phải giới hạn `permissions` của `GITHUB_TOKEN` để giảm hậu quả nếu một step bị khai thác.

## Thực hành và kiểm chứng

### Chuẩn bị

Bạn cần một repository có GitHub Actions được bật và quyền tạo file trong `.github/workflows/`. Configuration variable `LOG_LEVEL` là tùy chọn; workflow dùng `info` nếu biến này chưa tồn tại.

Sao chép workflow ở trên vào `.github/workflows/context-lab.yml`, rồi commit và push:

```bash
git add .github/workflows/context-lab.yml
git commit -m "ci: add context lab workflow"
git push
```

### Chạy hai trường hợp

1. Mở **Actions → Context Lab** và xem run do `push` tạo ra. Xác nhận target là `test`, debug step bị skip và job `test` có hai bản sao.
2. Chọn **Run workflow**, đặt `target` thành `staging`, bật `verbose`, rồi chạy. Xác nhận step debug in JSON của `runner`, `job` và `steps` nhưng không in toàn bộ `github` hay `secrets`.
3. Mở job `summarize`. Log phải chứa `prepare=success test=success`.
4. Tùy chọn: tạo repository variable `LOG_LEVEL=debug` tại **Settings → Secrets and variables → Actions → Variables**, chạy lại và xác nhận log đổi từ `info` thành `debug`.

Bạn cũng có thể chạy bằng GitHub CLI:

```bash
gh workflow run context-lab.yml -f target=staging -f verbose=true
gh run watch
gh run view --log
```

### Tiêu chí hoàn thành

| Kiểm chứng | Kết quả mong đợi |
|---|---|
| Expression và shell được phân biệt | Log có dữ liệu context đã truyền qua `env`; script đọc biến `$NAME` |
| Output step đi qua job | Cả hai bản sao matrix nhận cùng `build_label` từ `needs.prepare.outputs` |
| Matrix tạo đúng số job | Có `debug` và `release`; `job-total` bằng `2` |
| Input có fallback | Run do push dùng `target=test` |
| Input giữ đúng kiểu | Debug chỉ chạy khi lần chạy thủ công có `verbose=true` |
| Secret không bị in | Log chỉ xác nhận token tồn tại, không hiển thị token |
| Dependency được tổng hợp | `summarize` đọc được hai giá trị `needs.<job>.result` |

## Best practices

- **Kiểm tra availability theo đúng workflow key.** Đừng ghi nhớ context chỉ theo “cấp job” hoặc “cấp step”.
- **Chỉ đọc thuộc tính cần thiết.** Dùng `github.ref_name` thay vì dump toàn bộ `github`.
- **Đặt `id` ổn định cho step có output.** Không có `id`, step không thể được tham chiếu rõ ràng qua `steps`.
- **Khai báo dependency tường minh.** Nếu job cần output của job khác, thêm job đó vào `needs`; dependency bắc cầu không tự xuất hiện.
- **Dùng `inputs` cho input typed.** Tránh chuyển sang `github.event.inputs` nếu bạn cần giữ boolean hoặc number.
- **Truyền context vào `env` trước khi dùng trong shell.** Đây là biện pháp chính để giảm script injection từ dữ liệu event không tin cậy.
- **Quote biến shell.** Trong Bash, dùng `"$VALUE"`, không dùng `$VALUE` trần.
- **Không dùng secret làm điều kiện trực tiếp.** Nếu thật sự cần kiểm tra secret có được cấp hay không, ánh xạ nó vào `env` ở step và kiểm tra biến trong shell mà không in giá trị.
- **Đặt quyền token tối thiểu.** Context không tạo ranh giới bảo mật; `permissions` mới giới hạn khả năng của `GITHUB_TOKEN`.
- **Xem chuỗi rỗng là tín hiệu cần kiểm tra.** Một thuộc tính sai tên hoặc không có ở event hiện tại thường trở thành chuỗi rỗng thay vì lỗi rõ ràng.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Unrecognized named-value: 'runner'` | Dùng `runner` ở key được đánh giá trước khi job có runner, như `run-name` | Dùng context được phép ở key đó hoặc chuyển logic vào step |
| Giá trị `${{ env.NAME }}` rỗng nhưng `$NAME` có dữ liệu | `NAME` là biến mặc định hoặc biến process kế thừa, không được khai báo bằng khóa `env` | Đọc biến trong shell hoặc dùng thuộc tính context tương ứng |
| `${{ github.event.pull_request.title }}` rỗng | Workflow chạy bởi event không có payload `pull_request` | Kiểm tra `github.event_name` và tài liệu payload của trigger |
| `${{ steps.build.outputs.version }}` rỗng | Step thiếu `id: build`, chưa chạy, hoặc không ghi đúng vào `$GITHUB_OUTPUT` | Thêm `id`, kiểm tra thứ tự step và dòng `name=value` trong output file |
| `${{ needs.build.outputs.version }}` rỗng | `build` không nằm trong `needs` trực tiếp hoặc job chưa ánh xạ step output thành job output | Thêm `needs: build` và `jobs.build.outputs.version` |
| Không dùng được `secrets.X` trong `if` | Context `secrets` không khả dụng trực tiếp tại các key điều kiện đó | Ánh xạ secret vào `env` trong step và kiểm tra an toàn ở shell; không in giá trị |
| Matrix có nhiều bản sao nhưng output job không ổn định | Nhiều matrix job cùng ghi một tên job output; thứ tự hoàn tất không đảm bảo | Dùng tên output riêng hoặc artifact theo từng matrix value; tổng hợp ở job sau |
| `toJSON` làm log chứa quá nhiều dữ liệu | Dump object lớn như `github.event` hoặc toàn bộ context | Chỉ in context nhỏ hoặc một vài thuộc tính cần chẩn đoán |
| Lệnh hoạt động trên Ubuntu nhưng lỗi trên Windows | Cú pháp `$NAME` là của Bash, không phải PowerShell | Dùng `$env:NAME` trong PowerShell hoặc đặt `shell` tường minh |
| Giá trị có khoảng trắng làm lệnh sai | Biến shell không được quote | Dùng `"$VALUE"` và truyền dữ liệu qua `env` |

## Bước tiếp theo

<Cards>
  <Card title="Runners" href="/docs/nen-tang/06-runners/" description="Hiểu môi trường thực thi nơi runner context và biến mặc định xuất hiện." />
  <Card title="Expressions" href="/docs/nen-tang/08-expressions/" description="Đi sâu vào toán tử, hàm và quy tắc đánh giá biểu thức." />
  <Card title="Variables và environment variables" href="/docs/nen-tang/09-variables-va-environment-variables/" description="Quản lý cấu hình, phạm vi và thứ tự ưu tiên của biến." />
  <Card title="Secrets" href="/docs/nen-tang/10-secrets/" description="Lưu và sử dụng credential nhạy cảm an toàn hơn." />
</Cards>

## Tài liệu tham khảo

- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [Contexts concept](https://docs.github.com/en/actions/concepts/workflows-and-actions/contexts)
- [Variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
- [Evaluate expressions in workflows and actions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)
- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
