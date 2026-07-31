---
title: "Variables và environment variables"
description: "Phân biệt config variables, khóa env và biến mặc định; kiểm soát scope, precedence và truyền giá trị giữa steps, jobs trong GitHub Actions."
---

<Callout type="info" title="Mục tiêu của bài">
  Sau bài này, bạn có thể chọn đúng giữa `vars`, `env`, biến mặc định `GITHUB_*`/`RUNNER_*` và outputs. Bạn cũng sẽ chạy một workflow kiểm chứng precedence, truyền dữ liệu giữa steps bằng `GITHUB_ENV`/`GITHUB_OUTPUT`, rồi truyền tiếp sang job khác.
</Callout>

## Mục lục

- [Ba nhóm biến cần phân biệt](#ba-nhóm-biến-cần-phân-biệt)
  - [Configuration variables qua vars](#configuration-variables-qua-vars)
  - [Environment variables khai báo bằng env](#environment-variables-khai-báo-bằng-env)
  - [Biến mặc định GITHUB và RUNNER](#biến-mặc-định-github-và-runner)
- [Phạm vi và thứ tự ưu tiên](#phạm-vi-và-thứ-tự-ưu-tiên)
  - [Precedence của env theo workflow job step](#precedence-của-env-theo-workflow-job-step)
  - [Scope của config variables](#scope-của-config-variables)
  - [Precedence của config variables](#precedence-của-config-variables)
  - [Quy tắc đặt tên và giới hạn](#quy-tắc-đặt-tên-và-giới-hạn)
- [Expression-time và runner-time](#expression-time-và-runner-time)
  - [GitHub xử lý expression trước khi chạy lệnh](#github-xử-lý-expression-trước-khi-chạy-lệnh)
  - [Shell mở rộng environment variable trên runner](#shell-mở-rộng-environment-variable-trên-runner)
  - [Cú pháp theo Linux macOS và PowerShell](#cú-pháp-theo-linux-macos-và-powershell)
- [Truyền giá trị trong workflow](#truyền-giá-trị-trong-workflow)
  - [Giữa các steps bằng GITHUB_ENV](#giữa-các-steps-bằng-github_env)
  - [Tạo step output bằng GITHUB_OUTPUT](#tạo-step-output-bằng-github_output)
  - [Giữa các jobs bằng job outputs](#giữa-các-jobs-bằng-job-outputs)
- [Workflow hoàn chỉnh](#workflow-hoàn-chỉnh)
  - [Chuẩn bị config variable tùy chọn](#chuẩn-bị-config-variable-tùy-chọn)
  - [Tạo workflow](#tạo-workflow)
  - [Đọc luồng dữ liệu](#đọc-luồng-dữ-liệu)
- [Bài thực hành và tiêu chí kiểm chứng](#bài-thực-hành-và-tiêu-chí-kiểm-chứng)
  - [Chạy bản cơ sở](#chạy-bản-cơ-sở)
  - [Kiểm chứng precedence của env](#kiểm-chứng-precedence-của-env)
  - [Kiểm chứng config variable và fallback](#kiểm-chứng-config-variable-và-fallback)
  - [Kiểm chứng ranh giới giữa jobs](#kiểm-chứng-ranh-giới-giữa-jobs)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Bước tiếp theo](#bước-tiếp-theo)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Ba nhóm biến cần phân biệt

Trong GitHub Actions, từ “biến” thường chỉ ba cơ chế khác nhau. Chúng có nơi khai báo, thời điểm được xử lý và mục đích khác nhau.

| Nhóm | Khai báo hoặc nguồn | Cách đọc điển hình | Dùng khi |
|---|---|---|---|
| **Configuration variable** | Settings ở organization, repository hoặc environment | `${{ vars.DEPLOY_REGION }}` | Một cấu hình không nhạy cảm cần dùng lại ở nhiều workflow |
| **Environment variable tùy chỉnh** | Khóa `env:` trong YAML hoặc file `GITHUB_ENV` lúc chạy | `$NAME` trong Bash, `$env:NAME` trong PowerShell, `${{ env.NAME }}` trong expression | Truyền cấu hình vào process của một workflow, job hoặc step |
| **Default environment variable** | GitHub và runner tự tạo | `$GITHUB_SHA`, `$RUNNER_OS`; thường có context tương ứng như `${{ github.sha }}` | Đọc metadata của run, repository, runner và đường dẫn tạm |

Configuration variable không phải là environment variable chỉ vì cuối cùng bạn có thể ánh xạ nó vào `env`. Ví dụ sau lấy một giá trị từ `vars` rồi tạo environment variable cho process:

```yaml
steps:
  - name: Chuyển config variable vào môi trường shell
    env:
      DEPLOY_REGION: ${{ vars.DEPLOY_REGION }}
    run: |
      echo "Region: $DEPLOY_REGION"
```

### Configuration variables qua vars

Configuration variables, thường gọi ngắn là **config variables**, được lưu ngoài file workflow. GitHub cung cấp chúng qua context `vars`:

```yaml
runs-on: ${{ vars.RUNNER_LABEL || 'ubuntu-latest' }}
```

Nếu `RUNNER_LABEL` chưa tồn tại, `${{ vars.RUNNER_LABEL }}` trả về chuỗi rỗng. Toán tử `||` trong ví dụ chọn `ubuntu-latest` làm fallback, nhờ đó workflow vẫn chạy mà không cần cấu hình trước.

Config variables phù hợp với dữ liệu như:

- region triển khai;
- tên bucket không nhạy cảm;
- cờ bật hoặc tắt một bước;
- nhãn runner;
- mức log mặc định.

<Callout type="error" title="Config variable không phải secret">
  Giá trị trong `vars` không được thiết kế để bảo vệ hoặc che khỏi log. Không lưu token, mật khẩu, private key hay connection string chứa credential ở đây. Hãy dùng GitHub Actions secrets và context `secrets` cho dữ liệu nhạy cảm.
</Callout>

### Environment variables khai báo bằng env

Khóa `env` tạo environment variables cho process chạy trên runner. Bạn có thể đặt nó ở ba cấp:

```yaml
env:
  APP_NAME: storefront

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      LOG_LEVEL: info
    steps:
      - name: Chạy một step với giá trị riêng
        env:
          LOG_LEVEL: debug
        run: echo "$APP_NAME / $LOG_LEVEL"
```

Trong step trên, shell nhận `APP_NAME=storefront` và `LOG_LEVEL=debug`. Sau khi step kết thúc, giá trị `debug` không lan sang step kế tiếp.

Các giá trị trong cùng một `env` map không nên tham chiếu lẫn nhau. Nếu cần ghép biến, hãy dùng expression từ context ở nơi khác hoặc thực hiện phép ghép trong shell:

```yaml
env:
  APP_NAME: storefront
  # Không viết APP_DIR: $APP_NAME/dist tại đây.

steps:
  - run: echo "APP_DIR=$APP_NAME/dist" >> "$GITHUB_ENV"
```

### Biến mặc định GITHUB và RUNNER

GitHub tạo một tập biến mặc định cho mỗi run và cung cấp chúng cho mọi step. Một số biến thường dùng:

| Biến | Ý nghĩa |
|---|---|
| `GITHUB_REPOSITORY` | Repository theo dạng `owner/name` |
| `GITHUB_SHA` | Commit SHA gắn với sự kiện hiện tại |
| `GITHUB_REF` / `GITHUB_REF_NAME` | Ref đầy đủ / tên ref ngắn |
| `GITHUB_RUN_ID` | ID của workflow run; không đổi khi re-run |
| `GITHUB_RUN_ATTEMPT` | Số lần thử của cùng một run; tăng khi re-run |
| `GITHUB_WORKSPACE` | Thư mục làm việc mặc định trên runner |
| `RUNNER_OS` | `Linux`, `Windows` hoặc `macOS` |
| `RUNNER_ARCH` | Kiến trúc của runner |
| `RUNNER_TEMP` | Thư mục tạm của job |
| `GITHUB_ENV` | Đường dẫn file command dùng để tạo environment variable cho các step sau |
| `GITHUB_OUTPUT` | Đường dẫn file command dùng để tạo output của step hiện tại |

Các biến mặc định không được khai báo bằng khóa `env`, nên chúng **không nằm trong context `env`**. Trong expression, hãy dùng property tương ứng của context nếu có:

```yaml
jobs:
  inspect:
    if: ${{ github.ref == 'refs/heads/main' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Runner đang xử lý $GITHUB_REF"
```

Ở đây `${{ github.ref }}` được GitHub dùng để quyết định có tạo job hay không. `$GITHUB_REF` chỉ được Bash mở rộng sau khi job đã đến runner.

<Callout type="warn" title="Không ghi đè biến mặc định">
  Bạn không thể ghi đè các biến có tiền tố `GITHUB_` và `RUNNER_`; assignment sẽ bị bỏ qua. Hiện tại `CI` có thể bị ghi đè, nhưng GitHub không bảo đảm hành vi này tồn tại mãi. Hãy coi `CI` là biến do nền tảng quản lý và tạo một tên riêng, chẳng hạn `MY_PROJECT_CI_MODE`, nếu cần điều khiển hành vi của dự án.
</Callout>

## Phạm vi và thứ tự ưu tiên

Có hai hệ precedence riêng. Khóa `env` dùng cấp workflow, job, step. Config variables dùng cấp organization, repository, environment. Không trộn hai bảng precedence thành một danh sách duy nhất.

### Precedence của env theo workflow job step

Khi cùng tên xuất hiện nhiều lần, phạm vi cụ thể hơn thắng trong thời gian phạm vi đó thực thi:

```text
workflow env  <  job env  <  step env
  ít cụ thể                      cụ thể nhất
```

Ví dụ:

```yaml
env:
  LOG_LEVEL: warn

jobs:
  demo:
    runs-on: ubuntu-latest
    env:
      LOG_LEVEL: info
    steps:
      - name: Cấp step thắng
        env:
          LOG_LEVEL: debug
        run: test "$LOG_LEVEL" = "debug"

      - name: Hết step thì quay về cấp job
        run: test "$LOG_LEVEL" = "info"
```

`env` cấp workflow áp dụng cho các step của mọi job. `env` cấp job chỉ áp dụng cho các step trong job đó. `env` cấp step chỉ tồn tại khi step đó chạy.

Giá trị ghi qua `GITHUB_ENV` có hiệu lực với **các step đến sau trong cùng job**. Nó không quay lại sửa context của step đang chạy, không truyền tự động sang job khác và có thể bị một `env` cụ thể ở step sau che khuất.

### Scope của config variables

Config variables có ba scope quản trị:

| Scope | Nơi tạo trên GitHub | Phạm vi sử dụng |
|---|---|---|
| **Organization** | Organization **Settings → Secrets and variables → Actions → Variables** | Các repository được policy của organization cho phép |
| **Repository** | Repository **Settings → Secrets and variables → Actions → Variables** | Các workflow trong repository đó |
| **Environment** | Repository **Settings → Environments → chọn environment → Environment variables** | Job khai báo environment tương ứng |

Organization owner có thể cho mọi repository, chỉ private repository hoặc một danh sách repository được chọn truy cập variable. Khả năng dùng organization-level variable với private repository còn phụ thuộc gói GitHub; hãy kiểm tra ghi chú hiện hành trong [Store information in variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-an-organization).

Job chỉ nhận config variables của environment khi job tham chiếu environment đó:

```yaml
jobs:
  deploy:
    environment: production
    runs-on: ubuntu-latest
    steps:
      - env:
          DEPLOY_REGION: ${{ vars.DEPLOY_REGION }}
        run: echo "Deploy tới $DEPLOY_REGION"
```

Environment trong GitHub Actions là đối tượng triển khai có thể kèm approval, protection rules, secrets và variables. Nó không đồng nghĩa với khóa `env:`.

### Precedence của config variables

Theo quy tắc thông thường, scope thấp hơn và cụ thể hơn thắng:

```text
organization variable  <  repository variable  <  environment variable
```

Ví dụ, nếu cả organization và repository đều có `DEPLOY_REGION`, giá trị repository thắng. Nếu environment `production` cũng có cùng tên, biến của environment là giá trị ưu tiên cho job dùng environment đó.

Có một ngoại lệ thời điểm quan trọng: environment-level variables chỉ được cung cấp sau khi job bắt đầu trên runner. Theo tài liệu GitHub, chúng không ghi đè các giá trị đã có trong context `env` và `vars` trước thời điểm đó. Vì vậy:

- không dựa vào environment variable để thay đổi quyết định sớm như chọn `runs-on` hoặc `if` cấp job;
- tránh dùng cùng tên ở environment và đồng thời ánh xạ sớm `${{ vars.NAME }}` vào `env` cấp workflow/job;
- dùng tên rõ nghĩa theo tầng nếu thời điểm có giá trị quan trọng, ví dụ `ORG_DEFAULT_REGION` và `PROD_REGION`.

Với reusable workflow, `vars` đến từ repository của **caller**. Variables của repository chứa reusable workflow không tự động xuất hiện cho caller.

### Quy tắc đặt tên và giới hạn

Tên config variable chỉ gồm chữ cái, chữ số và dấu gạch dưới. Tên không được bắt đầu bằng số hoặc tiền tố `GITHUB_`. Tên không phân biệt hoa thường khi tham chiếu; GitHub lưu tên ở dạng chữ hoa. Trong thực tế, hãy dùng `UPPER_SNAKE_CASE` nhất quán và coi mọi environment variable là phân biệt hoa thường để workflow chạy đồng nhất trên các hệ điều hành.

Tại thời điểm tài liệu chính thức được tra cứu năm 2026, GitHub công bố các giới hạn sau:

- mỗi config variable tối đa **48 KB**;
- tối đa **500** variables cho một repository;
- tối đa **1.000** variables cho một organization;
- tối đa **100** variables cho một environment;
- tổng dung lượng organization và repository variables mà một workflow run nhận tối đa **256 KB**; environment variables không tính vào tổng này.

Khi vượt giới hạn tổng, không nên giả định mọi variable vẫn xuất hiện. GitHub áp dụng lựa chọn theo thứ tự tên sau khi tính phần repository trước. Hãy xem [Variables reference — Limits for configuration variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#limits-for-configuration-variables) trước khi thiết kế kho cấu hình lớn vì giới hạn có thể được GitHub cập nhật.

Config variables nên chứa các giá trị nhỏ, độc lập. Với cấu hình lớn hoặc có cấu trúc, lưu file đã version-control trong repository, tạo artifact, hoặc dùng một configuration store phù hợp thay vì nhồi JSON lớn vào `vars`.

## Expression-time và runner-time

Một workflow đi qua hai nơi xử lý:

```text
GitHub Actions service                  Runner
đọc YAML, contexts, expressions   →    chạy shell và process
${{ vars.NAME }} / ${{ env.NAME }}      $NAME / $env:NAME
```

Phân biệt hai thời điểm này giúp tránh lỗi “biến có trong shell nhưng không dùng được ở `if`” hoặc “expression trả chuỗi rỗng”.

### GitHub xử lý expression trước khi chạy lệnh

Cú pháp `${{ ... }}` là expression của GitHub Actions. GitHub dùng expression để chuẩn bị workflow và quyết định job hoặc step nào được gửi đến runner:

```yaml
jobs:
  deploy:
    if: ${{ vars.DEPLOY_ENABLED == 'true' }}
    runs-on: ${{ vars.RUNNER_LABEL || 'ubuntu-latest' }}
    steps:
      - name: Chọn tên artifact
        env:
          ARTIFACT_NAME: ${{ format('{0}-{1}', github.event.repository.name, github.run_number) }}
        run: echo "$ARTIFACT_NAME"
```

`if` cấp job không thể đọc `$DEPLOY_ENABLED`, vì lúc đánh giá điều kiện chưa có shell. Nó phải dùng context `vars`.

Không phải context nào cũng hợp lệ ở mọi khóa YAML. Khi dùng expression ở vị trí mới, kiểm tra bảng [Context availability](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability).

<Callout type="warn" title="Không chèn input không tin cậy thẳng vào script">
  Expression trong `run` được thay bằng chuỗi trước khi shell thực thi. Nếu giá trị đến từ tên branch, title hoặc body của pull request, kẻ tấn công có thể chèn cú pháp shell. Hãy ánh xạ giá trị vào `env` trung gian rồi đọc bằng cú pháp shell có quote, thay vì ghép `${{ github.event... }}` trực tiếp vào lệnh.
</Callout>

Ví dụ an toàn hơn:

```yaml
- name: In tiêu đề pull request
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: printf '%s\n' "$PR_TITLE"
```

### Shell mở rộng environment variable trên runner

Nội dung `run` được shell xử lý trên runner. Shell đọc environment variable theo cú pháp của chính nó:

```yaml
- name: Bash đọc biến lúc runner-time
  env:
    MESSAGE: Xin chào
  shell: bash
  run: printf '%s\n' "$MESSAGE"
```

Dùng runner-time khi giá trị chỉ cần cho lệnh hoặc process. Dùng expression-time khi giá trị điều khiển cấu trúc workflow như `if`, `runs-on`, `environment`, matrix hoặc input của action.

Trong một step `run`, cả hai cách đôi khi đều cho cùng kết quả:

```yaml
env:
  LOG_LEVEL: info

steps:
  - run: |
      echo "Expression: ${{ env.LOG_LEVEL }}"
      echo "Runner: $LOG_LEVEL"
```

Tuy nhiên, chúng không được xử lý cùng lúc. Hãy chọn cách thể hiện đúng nơi chịu trách nhiệm thay vì xem chúng là hai cú pháp thay thế hoàn toàn.

### Cú pháp theo Linux macOS và PowerShell

| Runner / shell | Đọc biến | Ghi vào `GITHUB_ENV` | Ghi vào `GITHUB_OUTPUT` |
|---|---|---|---|
| Linux hoặc macOS với Bash | `"$NAME"` hoặc `"${NAME}"` | `echo "NAME=value" >> "$GITHUB_ENV"` | `echo "name=value" >> "$GITHUB_OUTPUT"` |
| Windows hoặc runner bất kỳ với PowerShell Core `pwsh` | `$env:NAME` | `"NAME=value" >> $env:GITHUB_ENV` | `"name=value" >> $env:GITHUB_OUTPUT` |
| Windows PowerShell 5.1 `powershell` | `$env:NAME` | `"NAME=value" \| Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append` | `"name=value" \| Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append` |

Linux và macOS đều dùng cú pháp `$NAME` khi step chạy Bash hoặc `sh`. Nếu bạn chủ động chọn `shell: pwsh` trên Linux/macOS, phải dùng `$env:NAME` vì cú pháp phụ thuộc shell, không phụ thuộc hệ điều hành.

PowerShell Core dùng UTF-8 mặc định. Với Windows PowerShell 5.1, phải chỉ định `-Encoding utf8` khi ghi environment file. GitHub yêu cầu các file command này dùng UTF-8.

## Truyền giá trị trong workflow

Một biến shell chỉ tồn tại trong process hiện tại và các process con. Mỗi step chạy trong process riêng, còn mỗi job thường chạy trên runner riêng. Vì vậy, `export NAME=value` trong một step không đủ để truyền sang step sau.

### Giữa các steps bằng GITHUB_ENV

Ghi `NAME=value` vào file có đường dẫn trong `GITHUB_ENV` để các step **sau** trong cùng job nhận environment variable:

```yaml
steps:
  - name: Tạo phiên bản
    shell: bash
    run: |
      version="1.2.${GITHUB_RUN_NUMBER}"
      echo "APP_VERSION=$version" >> "$GITHUB_ENV"
      echo "Trong step hiện tại, dùng biến shell: $version"

  - name: Dùng ở step sau
    run: echo "APP_VERSION=$APP_VERSION"
```

Step ghi file không nhận `APP_VERSION` mới qua environment của chính nó. Runner chỉ đọc file sau khi step kết thúc. Nếu cần dùng ngay, giữ giá trị trong biến shell như `version` ở ví dụ.

Với giá trị nhiều dòng, dùng delimiter không xuất hiện trên một dòng riêng trong dữ liệu:

```yaml
- name: Ghi giá trị nhiều dòng
  shell: bash
  run: |
    delimiter="EOF_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
    {
      echo "REPORT<<$delimiter"
      printf 'dòng 1\ndòng 2\n'
      echo "$delimiter"
    } >> "$GITHUB_ENV"
```

Nếu dữ liệu hoàn toàn tùy ý và không bảo đảm delimiter không va chạm, hãy ghi dữ liệu vào file thông thường rồi truyền đường dẫn file. Ngoài ra, `GITHUB_ENV` không được phép đặt `NODE_OPTIONS` do giới hạn bảo mật.

### Tạo step output bằng GITHUB_OUTPUT

Dùng `GITHUB_OUTPUT` khi giá trị là kết quả có tên của một step. Step cần có `id` để step sau tham chiếu:

```yaml
steps:
  - name: Tạo metadata
    id: metadata
    shell: bash
    run: echo "build_id=${GITHUB_RUN_NUMBER}-${GITHUB_RUN_ATTEMPT}" >> "$GITHUB_OUTPUT"

  - name: Dùng step output
    env:
      BUILD_ID: ${{ steps.metadata.outputs.build_id }}
    run: echo "BUILD_ID=$BUILD_ID"
```

Khác biệt thực dụng:

- `GITHUB_ENV` tạo environment variable cho mọi step phía sau trong cùng job;
- `GITHUB_OUTPUT` tạo một output có namespace rõ ràng: `steps.<id>.outputs.<name>`;
- muốn nâng giá trị lên job output để job khác dùng, phải bắt đầu từ step output.

Không dùng cú pháp workflow command cũ `::set-output`; hãy ghi vào `GITHUB_OUTPUT`.

### Giữa các jobs bằng job outputs

Để truyền giá trị sang job khác, thực hiện ba bước:

1. Step nguồn ghi output vào `GITHUB_OUTPUT`.
2. Job nguồn ánh xạ step output vào `jobs.<job_id>.outputs`.
3. Job đích khai báo `needs` và đọc `${{ needs.<job_id>.outputs.<name> }}`.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      build_id: ${{ steps.metadata.outputs.build_id }}
    steps:
      - id: metadata
        run: echo "build_id=${GITHUB_RUN_NUMBER}-${GITHUB_RUN_ATTEMPT}" >> "$GITHUB_OUTPUT"

  deploy:
    needs: build
    runs-on: ubuntu-latest
    env:
      BUILD_ID: ${{ needs.build.outputs.build_id }}
    steps:
      - run: |
          echo "Nhận từ job build: $BUILD_ID"
```

`needs: build` vừa tạo dependency, vừa làm context `needs.build.outputs` khả dụng. Một environment variable tạo bằng `GITHUB_ENV` trong job `build` không tự đi theo sang `deploy`.

Outputs phù hợp với metadata nhỏ như version, ID hoặc đường dẫn logic. Nếu cần chuyển file build, report hoặc dữ liệu lớn giữa jobs, hãy dùng artifact thay vì nhét nội dung vào output.

## Workflow hoàn chỉnh

Workflow sau chạy được mà không cần checkout mã nguồn hay tạo variable trước. Nếu repository có config variable `DEPLOY_REGION`, workflow dùng giá trị đó; nếu không, nó dùng fallback `ap-southeast-1`.

### Chuẩn bị config variable tùy chọn

Để kiểm chứng `vars`, tạo repository variable:

1. Mở repository trên GitHub.
2. Chọn **Settings → Secrets and variables → Actions → Variables**.
3. Chọn **New repository variable**.
4. Đặt tên `DEPLOY_REGION`, giá trị ví dụ `eu-west-1`, rồi lưu.

Bạn có thể bỏ qua bước này trong lần chạy đầu. Không tạo secret cho bài này vì region không phải dữ liệu nhạy cảm.

### Tạo workflow

Tạo `.github/workflows/variables-demo.yml` với nội dung:

```yaml
name: Variables demo

on:
  workflow_dispatch:

permissions:
  contents: read

env:
  APP_NAME: variables-demo
  LOG_LEVEL: warn
  EFFECTIVE_REGION: ${{ vars.DEPLOY_REGION || 'ap-southeast-1' }}

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      LOG_LEVEL: info
    outputs:
      build_id: ${{ steps.metadata.outputs.build_id }}
    steps:
      - name: Kiểm chứng scope cấp step
        env:
          LOG_LEVEL: debug
        run: |
          echo "APP_NAME=$APP_NAME"
          echo "LOG_LEVEL trong step=$LOG_LEVEL"
          test "$LOG_LEVEL" = "debug"

      - name: Kiểm chứng quay về scope cấp job
        run: |
          echo "LOG_LEVEL sau step trước=$LOG_LEVEL"
          test "$LOG_LEVEL" = "info"

      - name: Tạo environment variable và step output
        id: metadata
        shell: bash
        run: |
          build_id="${GITHUB_RUN_NUMBER}-${GITHUB_RUN_ATTEMPT}"
          echo "BUILD_ID=$build_id" >> "$GITHUB_ENV"
          echo "build_id=$build_id" >> "$GITHUB_OUTPUT"
          echo "Giá trị cục bộ trong step tạo: $build_id"

      - name: Dùng giá trị ở step sau
        env:
          OUTPUT_BUILD_ID: ${{ steps.metadata.outputs.build_id }}
        run: |
          echo "BUILD_ID từ GITHUB_ENV=$BUILD_ID"
          echo "Step output=$OUTPUT_BUILD_ID"
          test "$BUILD_ID" = "$OUTPUT_BUILD_ID"

  report:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      BUILD_ID: ${{ needs.build.outputs.build_id }}
    steps:
      - name: Kiểm chứng config và default variables
        shell: bash
        run: |
          echo "Ứng dụng: $APP_NAME"
          echo "Region hiệu lực: $EFFECTIVE_REGION"
          echo "Build nhận từ job build: $BUILD_ID"
          echo "Repository: $GITHUB_REPOSITORY"
          echo "Runner: $RUNNER_OS/$RUNNER_ARCH"
          test -n "$BUILD_ID"
          test -n "$EFFECTIVE_REGION"
```

Commit và push file. Vì workflow chỉ có `workflow_dispatch`, hãy mở **Actions → Variables demo → Run workflow** để chạy thủ công. File phải có trên nhánh mặc định thì nút chạy thủ công mới xuất hiện.

### Đọc luồng dữ liệu

Workflow thể hiện bốn đường đi khác nhau:

```text
vars.DEPLOY_REGION ──expression──► EFFECTIVE_REGION ──► process trên runner
workflow env LOG_LEVEL ──bị job che──► info ──bị step che tạm thời──► debug
step metadata ──GITHUB_ENV──► step kế tiếp trong job build
step metadata ──GITHUB_OUTPUT──► job output ──needs──► job report
```

`APP_NAME` và `EFFECTIVE_REGION` được khai báo ở workflow nên có trong các step của cả hai jobs. `BUILD_ID` ghi vào `GITHUB_ENV` chỉ tồn tại ở các step sau của `build`; job `report` nhận cùng giá trị qua job output, không phải qua environment kế thừa.

## Bài thực hành và tiêu chí kiểm chứng

### Chạy bản cơ sở

Chạy workflow khi repository **chưa có** `DEPLOY_REGION`. Mở log của job `report` và xác nhận:

- `Region hiệu lực: ap-southeast-1`;
- `Build nhận từ job build` không rỗng;
- repository có dạng `owner/name`;
- runner là `Linux/X64` hoặc kiến trúc thực tế mà GitHub cấp.

Hai job phải kết thúc với trạng thái **Success**.

### Kiểm chứng precedence của env

Trong job `build`, đối chiếu hai step đầu:

- **Kiểm chứng scope cấp step** in `debug`;
- **Kiểm chứng quay về scope cấp job** in `info`.

Sau đó xóa `env: LOG_LEVEL: debug` ở step đầu, commit và chạy lại. Step đầu lúc này nhận `info` từ job, nên lệnh `test "$LOG_LEVEL" = "debug"` cố ý thất bại. Sửa assertion thành `info` hoặc khôi phục step-level `env`, rồi chạy lại để có trạng thái **Success**.

### Kiểm chứng config variable và fallback

Tạo repository variable `DEPLOY_REGION=eu-west-1`, rồi chạy lại workflow. Job `report` phải in `Region hiệu lực: eu-west-1`.

Đổi giá trị thành `us-east-1` và chạy một run mới. Run mới phải in giá trị mới. Re-run một run cũ có thể dùng lại workflow/commit cũ, nhưng config variable được đọc theo cấu hình khả dụng khi job thực thi; đừng dùng lịch sử run làm nơi lưu snapshot cấu hình.

Nếu có quyền quản trị organization, bạn có thể kiểm chứng precedence bằng cách tạo organization variable cùng tên với giá trị khác và cho repository truy cập. Repository variable phải thắng. Với environment-level variable, hãy tạo environment riêng và job tham chiếu `environment`; đồng thời lưu ý ngoại lệ thời điểm đã nêu ở phần [Precedence của config variables](#precedence-của-config-variables).

### Kiểm chứng ranh giới giữa jobs

Tạm xóa phần sau khỏi job `report`:

```yaml
env:
  BUILD_ID: ${{ needs.build.outputs.build_id }}
```

Run mới sẽ thất bại ở `test -n "$BUILD_ID"`, dù job `build` đã ghi `BUILD_ID` vào `GITHUB_ENV`. Điều này chứng minh `GITHUB_ENV` không vượt qua ranh giới job.

Khôi phục ánh xạ từ `needs.build.outputs.build_id` và chạy lại. Hoàn thành bài khi:

| Tiêu chí | Bằng chứng |
|---|---|
| Scope `env` đúng | Step-level là `debug`, step kế tiếp quay về job-level `info` |
| Fallback hoạt động | Không có config variable vẫn nhận `ap-southeast-1` |
| `vars` hoạt động | Sau khi tạo variable, log nhận đúng region đã cấu hình |
| `GITHUB_ENV` hoạt động | Step sau trong `build` đọc được `BUILD_ID` |
| `GITHUB_OUTPUT` hoạt động | `OUTPUT_BUILD_ID` bằng `BUILD_ID` |
| Job output hoạt động | Job `report` nhận build ID qua `needs` |
| Default variables hoạt động | Log có repository, OS và kiến trúc runner |
| Workflow cuối hợp lệ | Cả `build` và `report` đều **Success** |

## Best practices

- **Dùng đúng kho lưu trữ:** `vars` cho cấu hình không nhạy cảm dùng lại; `secrets` cho credential; `env` cho môi trường process; outputs cho kết quả phát sinh trong run.
- **Đặt tên mô tả scope:** ưu tiên `DEPLOY_REGION`, `ARTIFACT_PREFIX`, `TEST_LOG_LEVEL` thay cho `VALUE` hoặc `CONFIG`. Dùng `UPPER_SNAKE_CASE` nhất quán.
- **Cung cấp fallback khi hợp lý:** `${{ vars.RUNNER_LABEL || 'ubuntu-latest' }}` giúp workflow dùng được ở repository chưa cấu hình. Với cấu hình bắt buộc, kiểm tra rỗng và fail sớm thay vì âm thầm chọn mặc định nguy hiểm.
- **Không dùng string mơ hồ cho boolean mà không so sánh:** `vars.FEATURE_ENABLED` là chuỗi. Viết `${{ vars.FEATURE_ENABLED == 'true' }}` thay vì dựa vào cảm giác truthy/falsy.
- **Giảm scope:** chỉ đặt variable ở workflow nếu mọi job cần nó. Cấu hình riêng của một command nên ở step để tránh vô tình ảnh hưởng action khác.
- **Không ghi đè tên nền tảng:** không đặt `GITHUB_*`, `RUNNER_*`, và không dựa vào khả năng ghi đè `CI`.
- **Quote ở shell:** dùng `"$NAME"` trong Bash và truyền context không tin cậy qua `env` trung gian. Điều này giảm lỗi do khoảng trắng, wildcard và script injection.
- **Dùng output cho giao diện dữ liệu:** một step tạo version nên xuất `build_id`; job sau đọc qua `needs`. Cách này rõ dependency hơn việc dựa vào biến môi trường ẩn.
- **Dùng artifact cho file:** outputs không phải kênh vận chuyển binary, report lớn hoặc bundle build.
- **Không in toàn bộ context:** đặc biệt không dump toàn bộ `github` context vì nó có thể chứa thông tin nhạy cảm như token. Chỉ in property cần chẩn đoán.
- **Ghi tài liệu cho variable bắt buộc:** nêu tên, scope, giá trị hợp lệ, owner và fallback trong README hoặc runbook của repository.
- **Rà giới hạn trên tài liệu chính thức:** giới hạn và khả năng theo gói GitHub có thể thay đổi; đừng hard-code giả định quản trị vào tooling nội bộ.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `${{ vars.NAME }}` là chuỗi rỗng | Variable chưa tạo, sai tên, repository không được policy organization cho truy cập, hoặc job chưa gắn environment | Kiểm tra đúng scope trong **Settings**, dùng tên chữ hoa nhất quán, kiểm tra repository access và `jobs.<id>.environment` |
| `$NAME` rỗng nhưng `${{ vars.NAME }}` có giá trị | Config variable chưa được ánh xạ vào `env` của step/job/workflow | Thêm `env: NAME: ${{ vars.NAME }}` trước khi đọc bằng shell |
| Dùng `$NAME` trong `if` không hoạt động | `if` do GitHub xử lý trước runner, không có shell expansion | Dùng `${{ env.NAME }}`, `${{ vars.NAME }}` hoặc context phù hợp |
| PowerShell in nguyên `$NAME` | PowerShell đọc environment variable bằng `$env:NAME` | Đổi thành `$env:NAME`, hoặc chọn rõ `shell: bash` nếu muốn cú pháp Bash |
| Biến tạo ở step trước không tồn tại | Chỉ chạy `export`, ghi sai file, hoặc dùng `>` làm mất các dòng đã có | Ghi `NAME=value` với `>> "$GITHUB_ENV"`; trên PowerShell dùng `$env:GITHUB_ENV` và UTF-8 |
| Step tạo `GITHUB_ENV` không thấy giá trị mới | Runner chỉ nạp file sau khi step kết thúc | Dùng biến shell cục bộ trong step hiện tại; đọc environment variable từ step kế tiếp |
| Không đọc được `steps.x.outputs.y` | Step nguồn thiếu `id`, tên `id` sai hoặc ghi nhầm vào `GITHUB_ENV` | Đặt `id`, ghi `y=value` vào `GITHUB_OUTPUT`, rồi tham chiếu đúng `steps.<id>.outputs.<name>` |
| Job sau không có output | Thiếu `needs`, chưa ánh xạ output ở cấp job, hoặc job nguồn bị skip/fail | Khai báo `outputs` ở job nguồn và `needs` ở job đích; kiểm tra conclusion của job nguồn |
| Environment variable không thắng repository variable như dự kiến | Environment-level variable đến sau khi job bắt đầu và không ghi đè giá trị context đã được materialize sớm | Tránh trùng tên giữa các tầng, kiểm tra nơi expression được đánh giá và đối chiếu quy tắc precedence chính thức |
| Cố gán `GITHUB_SHA` hoặc `RUNNER_OS` nhưng giá trị không đổi | `GITHUB_*` và `RUNNER_*` là biến mặc định được bảo vệ | Tạo tên riêng như `SOURCE_SHA_OVERRIDE`; không sửa biến nền tảng |
| `CI=false` đang hoạt động nhưng không ổn định | GitHub hiện cho ghi đè `CI` nhưng không bảo đảm trong tương lai | Tạo biến riêng của dự án và để `CI` do GitHub quản lý |
| Giá trị nhiều dòng bị cắt hoặc làm hỏng file command | Delimiter xuất hiện trong dữ liệu, encoding không phải UTF-8 | Dùng delimiter ngẫu nhiên không va chạm; với dữ liệu tùy ý, ghi file và truyền đường dẫn |
| Workflow YAML hợp lệ nhưng expression bị từ chối | Context không khả dụng tại khóa YAML đó | Đối chiếu bảng **Context availability** trong tài liệu chính thức |

## Bước tiếp theo

<Cards>
  <Card title="Contexts" href="/docs/nen-tang/07-contexts/" description="Hiểu đầy đủ github, env, vars, steps, needs, runner và phạm vi khả dụng." />
  <Card title="Expressions" href="/docs/nen-tang/08-expressions/" description="Viết điều kiện, fallback và xử lý dữ liệu ở expression-time." />
  <Card title="Secrets" href="/docs/nen-tang/10-secrets/" description="Lưu và sử dụng credential đúng cách thay vì đặt dữ liệu nhạy cảm trong vars." />
  <Card title="Jobs và steps" href="/docs/nen-tang/04-jobs-va-steps/" description="Đào sâu dependency, needs và luồng thực thi giữa các jobs." />
</Cards>

## Tài liệu tham khảo

- [Store information in variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)
- [Variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
- [Default environment variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#default-environment-variables)
- [Configuration variable precedence](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#configuration-variable-precedence)
- [Limits for configuration variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#limits-for-configuration-variables)
- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [Context availability](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
- [Workflow syntax — env](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env)
- [Workflow syntax — job outputs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs)
- [Workflow commands — environment files](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#environment-files)
- [Workflow commands — setting an environment variable](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-environment-variable)
- [Workflow commands — setting an output parameter](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-output-parameter)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
