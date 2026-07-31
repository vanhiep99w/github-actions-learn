---
title: Xử lý lỗi trong GitHub Actions
description: Phân loại lỗi transient/permanent, retry có kiểm soát, cleanup, artifact và escalation để workflow thất bại đúng cách.
---

<Callout type="info">
  Trang này tập trung vào failure handling trong GitHub Actions: khi nào nên retry, khi nào nên dừng, cách giữ lại artifact chẩn đoán, và cách để cleanup vẫn chạy được mà không làm workflow bị treo.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
- [Phân loại lỗi](#phân-loại-lỗi)
  - [Lỗi transient](#lỗi-transient)
  - [Lỗi permanent](#lỗi-permanent)
  - [Cách quyết định retry](#cách-quyết-định-retry)
- [Failure path trong GitHub Actions](#failure-path-trong-github-actions)
  - [Failure path ở cấp step](#failure-path-ở-cấp-step)
  - [Failure path ở cấp job](#failure-path-ở-cấp-job)
  - [Hủy chạy và concurrency](#hủy-chạy-và-concurrency)
- [Retry có kiểm soát và timeout](#retry-có-kiểm-soát-và-timeout)
  - [Khi nào nên retry](#khi-nào-nên-retry)
  - [Mẫu retry an toàn](#mẫu-retry-an-toàn)
  - [Timeout để chặn treo](#timeout-để-chặn-treo)
- [continue on error và các biểu thức trạng thái](#continue-on-error-và-các-biểu-thức-trạng-thái)
  - [continue on error](#continue-on-error)
  - [Ba hàm always failure và cancelled](#ba-hàm-always-failure-và-cancelled)
- [Cleanup artifact và dữ liệu chẩn đoán](#cleanup-artifact-và-dữ-liệu-chẩn-đoán)
  - [Cleanup cuối workflow](#cleanup-cuối-workflow)
  - [Artifact khi thất bại](#artifact-khi-thất-bại)
- [Idempotency và escalation](#idempotency-và-escalation)
  - [Idempotency](#idempotency)
  - [Escalation](#escalation)
- [Ví dụ workflow hoàn chỉnh](#ví-dụ-workflow-hoàn-chỉnh)
- [Quy trình áp dụng](#quy-trình-áp-dụng)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Tổng quan

GitHub Actions xử lý lỗi theo hai lớp chính: **step** và **job**. Một step là một lệnh hoặc action nhỏ trong job. Một job là một nhóm step chạy trên cùng một runner.

Mục tiêu của failure handling không phải là làm mọi thứ “thành công bằng mọi giá”. Mục tiêu đúng hơn là:

- phân biệt lỗi tạm thời với lỗi cố định,
- retry có giới hạn thay vì retry vô hạn,
- dừng đúng lúc khi lỗi là thật,
- giữ lại bằng chứng để chẩn đoán,
- và cleanup tài nguyên dù workflow có fail.

<Callout type="info" title="Thuật ngữ cần nhớ">
  **Transient** là lỗi tạm thời, ví dụ mạng chập chờn, registry trả về 5xx, hoặc runner bị ngắt giữa chừng. **Permanent** là lỗi cố định, ví dụ test đỏ, sai cấu hình, thiếu secret, hoặc code sai. **Idempotent** là thao tác có thể chạy lại nhiều lần mà trạng thái cuối vẫn như cũ.
</Callout>

| Loại | Nghĩa đơn giản | Ví dụ | Hành động mặc định |
|------|----------------|-------|--------------------|
| Transient | Lỗi có thể tự hết | `502`, `503`, `ECONNRESET`, timeout tạm thời, rate limit | Retry có kiểm soát |
| Permanent | Lỗi phải sửa root cause | Assertion fail, syntax error, thiếu biến môi trường, quyền sai | Fail fast |
| Không rõ | Chưa đủ dữ liệu để kết luận | Lỗi hiếm chỉ xảy ra một lần, log không đủ | Thu thập artifact rồi mới quyết định |

Nói ngắn gọn: **retry chỉ nên dùng để vượt qua nhiễu tạm thời**, không phải để che lỗi thiết kế.

## Phân loại lỗi

### Lỗi transient

Lỗi transient là lỗi mang tính ngắn hạn. Chạy lại cùng một thao tác sau vài giây hoặc vài phút có thể thành công.

Các dấu hiệu hay gặp:

- `502`, `503`, `504` từ API hoặc registry.
- `ECONNRESET`, `ETIMEDOUT`, `Temporary failure in name resolution`.
- package registry chập chờn khi `npm ci`, `pip install`, `go mod download`.
- runner bị preempt hoặc mạng nội bộ bị gián đoạn.
- giới hạn tần suất API, còn gọi là rate limit.

Transient là loại lỗi hợp lý để retry, nhưng vẫn phải có **retry budget**. Retry budget là số lần retry tối đa và tổng thời gian tối đa cho phép trước khi dừng.

### Lỗi permanent

Lỗi permanent là lỗi sẽ tiếp tục fail cho đến khi bạn sửa code, sửa cấu hình, hoặc sửa dữ liệu đầu vào.

Các dấu hiệu hay gặp:

- unit test fail ổn định ở mọi lần chạy,
- lint hoặc type check báo lỗi thật,
- thiếu secret hoặc secret sai,
- file path sai,
- quyền truy cập sai,
- schema thay đổi nhưng workflow chưa cập nhật,
- step trước đó tạo dữ liệu sai nên step sau fail theo.

Retry cho loại lỗi này chỉ làm tốn thời gian. Nó còn che mất nguyên nhân thật.

### Cách quyết định retry

Hãy tự hỏi ba câu sau:

1. Lỗi có mang tính ngẫu nhiên không?
2. Chạy lại cùng input có khả năng thành công không?
3. Thao tác đó có idempotent không?

Nếu cả ba câu đều nghiêng về “có”, retry là hợp lý.
Nếu một trong ba câu là “không”, hãy dừng sớm và lấy bằng chứng.

<Callout type="warn" title="Retry không an toàn">
  Đừng retry mù các thao tác có side effect không idempotent như tạo deployment, đăng ký webhook, gửi email, gọi API thanh toán, hoặc tạo resource rồi không có khóa định danh rõ ràng. Nếu thao tác đã ghi dữ liệu thật mà bạn retry lại, bạn có thể tạo ra dữ liệu trùng, chi phí trùng, hoặc trạng thái khó khôi phục.
</Callout>

## Failure path trong GitHub Actions

### Failure path ở cấp step

Khi một step trả về exit code khác 0, GitHub Actions đánh dấu step đó là failed.

Mặc định, các step phía sau trong cùng job sẽ không chạy nếu job đã rơi vào trạng thái lỗi. Đây là hành vi “fail fast” cơ bản, giúp workflow dừng sớm khi đã biết kết quả là hỏng.

Nếu bạn muốn xử lý sau lỗi, bạn cần dùng `if:` với status check function như `failure()` hoặc `always()`.

```yaml
- name: Upload logs khi fail
  if: ${{ failure() }}
  uses: actions/upload-artifact@v4
  with:
    name: logs
    path: logs/
```

### Failure path ở cấp job

Một job fail khi có step quan trọng fail mà không được cho phép bỏ qua.

Khi một job fail, các job phụ thuộc bằng `needs` thường sẽ bị skip nếu bạn không viết điều kiện riêng. Nếu bạn muốn job hậu kiểm vẫn chạy, hãy dùng `if: ${{ failure() }}` hoặc `if: ${{ always() }}` ở job đó.

Ví dụ:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test

  notify:
    needs: test
    if: ${{ failure() }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Gửi cảnh báo cho đội trực"
```

### Hủy chạy và concurrency

Hủy chạy là một trạng thái khác với failure. Một workflow có thể bị hủy thủ công, hoặc bị hủy tự động do `concurrency.cancel-in-progress: true`.

`concurrency` giúp bạn tránh tình trạng nhiều run cũ cùng đụng vào một môi trường deploy hoặc cùng sinh ra kết quả lỗi thời.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Điểm quan trọng là: **canceled không phải là failed**.

- Dùng `failure()` khi bạn muốn phản ứng với lỗi thật.
- Dùng `cancelled()` khi bạn muốn phản ứng với việc run bị hủy.
- Dùng `always()` cho cleanup hoặc artifact nếu bạn vẫn muốn chạy phần đó sau khi có lỗi.

## Retry có kiểm soát và timeout

### Khi nào nên retry

Retry phù hợp cho các thao tác đọc, tải, hoặc khởi tạo mà có thể bị nhiễu tạm thời.

Ví dụ hợp lý:

- tải dependency từ registry,
- gọi API đọc dữ liệu,
- download artifact,
- test flaky đã biết rõ nguyên nhân nằm ở hạ tầng,
- chờ một service khởi động xong.

Không nên retry các bước khẳng định trạng thái thật của hệ thống, như test assertion, lint, hoặc deploy không có cơ chế rollback rõ ràng.

### Mẫu retry an toàn

Dùng retry có giới hạn và backoff tăng dần. Backoff tăng dần nghĩa là mỗi lần retry sẽ đợi lâu hơn lần trước, ví dụ 5s, 10s, 20s.

```bash
retry() {
  local max=3
  local delay=5
  local attempt=1

  until "$@"; do
    if [ "$attempt" -ge "$max" ]; then
      echo "::error::Command failed after ${attempt} attempts: $*"
      return 1
    fi

    echo "::warning::Attempt ${attempt} failed. Retrying in ${delay}s..."
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}
```

Cách dùng:

```yaml
- name: Install dependencies with retry
  shell: bash
  run: |
    retry() {
      local max=3
      local delay=5
      local attempt=1

      until "$@"; do
        if [ "$attempt" -ge "$max" ]; then
          echo "::error::Command failed after ${attempt} attempts: $*"
          return 1
        fi

        echo "::warning::Attempt ${attempt} failed. Retrying in ${delay}s..."
        sleep "$delay"
        attempt=$((attempt + 1))
        delay=$((delay * 2))
      done
    }

    retry npm ci
```

### Timeout để chặn treo

Timeout là lớp bảo vệ để workflow không treo vô hạn.

Ở cấp job, dùng `timeout-minutes`.
Ở cấp lệnh, bạn có thể dùng `timeout` của shell nếu một câu lệnh riêng có nguy cơ chờ mãi.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - run: timeout 15m npm test
```

Nên đặt timeout cho mọi job dài hoặc phụ thuộc vào hệ thống bên ngoài. Nếu không, một lỗi hạ tầng có thể giữ runner bận vô ích đến hết quota.

## continue on error và các biểu thức trạng thái

### continue on error

`continue-on-error` cho phép một step fail mà job vẫn đi tiếp.

Cách này hữu ích cho:

- kiểm tra không chặn như lint mềm,
- test thử nghiệm,
- hoặc tình huống bạn muốn thu thập đủ artifact trước khi fail thật.

Khi dùng `continue-on-error`, hãy gắn `id` cho step đó và kiểm tra kết quả bằng context của step.

```yaml
- name: Run tests
  id: tests
  continue-on-error: true
  run: npm test

- name: Upload diagnostics
  if: ${{ always() }}
  uses: actions/upload-artifact@v4
  with:
    name: diagnostics
    path: logs/

- name: Fail the job if tests failed
  if: ${{ steps.tests.outcome == 'failure' }}
  run: exit 1
```

Mẫu này gọi là **fail closed có kiểm soát**: workflow chỉ mở cửa đủ lâu để lấy bằng chứng, sau đó fail thật.

### Ba hàm always failure và cancelled

Ba hàm này là nền tảng để điều khiển failure path:

| Hàm | Ý nghĩa thực tế | Khi dùng |
|-----|------------------|----------|
| `always()` | Luôn true, kể cả khi job bị hủy | cleanup, artifact, notify |
| `failure()` | True khi step hoặc job trước đó thất bại | bước hậu kiểm, notification sau lỗi |
| `cancelled()` | True khi run bị hủy | đóng tài nguyên tạm, ghi log hủy |

<Callout type="warn" title="Đừng lạm dụng always">
  `always()` rất hữu ích cho cleanup và artifact, nhưng không nên dùng cho bước mở đầu như `checkout` hoặc các bước có thể bị kẹt khi nguồn bên ngoài không phản hồi. Nếu bạn chỉ muốn chạy khi job không bị hủy, dùng `if: ${{ always() && !cancelled() }}` sẽ an toàn hơn.
</Callout>

Một số mẫu thực tế:

```yaml
- name: Cleanup preview environment
  if: ${{ always() && !cancelled() }}
  run: ./scripts/cleanup.sh

- name: Post failure summary
  if: ${{ failure() }}
  run: echo "Workflow failed, xem artifact để chẩn đoán"
```

## Cleanup artifact và dữ liệu chẩn đoán

### Cleanup cuối workflow

Cleanup là bước dọn các tài nguyên tạm như database preview, container, file tạm, hoặc secret ngắn hạn.

Khi cleanup quan trọng, hãy để nó chạy ngay cả khi step trước fail. Nếu cleanup cũng fail, ít nhất bạn vẫn biết workflow lỗi ở đâu.

Một pattern phổ biến là:

- chạy cleanup ở step cuối,
- dùng `if: ${{ always() && !cancelled() }}` nếu không muốn chạy khi run đã bị hủy,
- và giữ cho cleanup idempotent để chạy lại cũng không gây hại.

### Artifact khi thất bại

Artifact là gói dữ liệu được upload lên GitHub để bạn tải xuống sau khi run kết thúc.

Khi workflow fail, artifact nên chứa những thứ giúp bạn chẩn đoán nhanh:

- log ứng dụng,
- test report,
- coverage,
- screenshot,
- trace,
- hoặc file cấu hình đã được render ra thực tế.

```yaml
- name: Upload diagnostics
  if: ${{ always() }}
  uses: actions/upload-artifact@v4
  with:
    name: diagnostics-${{ github.run_id }}
    path: |
      test-results/
      coverage/
      logs/
    retention-days: 7
```

Lưu ý quan trọng:

- Đừng chờ đến cuối mới tạo artifact nếu dữ liệu đang dễ mất.
- Đặt tên artifact có `run_id` hoặc `sha` để tránh trùng.
- Nếu artifact không còn ý nghĩa sau vài ngày, giảm `retention-days` để tiết kiệm dung lượng.

## Idempotency và escalation

### Idempotency

Idempotency là khả năng chạy nhiều lần mà kết quả cuối vẫn như một lần chạy.

Đây là điều kiện gần như bắt buộc nếu bạn muốn retry an toàn.

Ví dụ thường idempotent hơn:

- `npm ci`, `pip install`, `go mod download`,
- GET request đọc dữ liệu,
- upload artifact với tên được kiểm soát,
- dọn môi trường tạm bằng script đã kiểm tra tồn tại.

Ví dụ thường không an toàn nếu retry mù:

- tạo deployment mới,
- gọi API ghi dữ liệu,
- gửi email,
- tạo ticket,
- xóa tài nguyên mà không xác nhận trạng thái hiện tại.

### Escalation

Escalation là chuyển lỗi từ máy sang người.

Bạn nên escalate khi:

- retry budget đã hết,
- lỗi lặp lại với cùng triệu chứng,
- lỗi ảnh hưởng đến nhánh chính hoặc môi trường production,
- hoặc artifact cho thấy đây là lỗi permanent.

Mẫu escalation tốt thường có ba phần:

1. một câu mô tả ngắn về lỗi,
2. artifact hoặc log để người trực xem ngay,
3. tín hiệu rõ ràng rằng workflow đã fail thật, không phải soft-fail.

Tùy tổ chức, escalation có thể là:

- Slack message,
- email cho on-call,
- mở issue tự động,
- hoặc tạo incident trong hệ thống vận hành.

## Ví dụ workflow hoàn chỉnh

Ví dụ dưới đây kết hợp retry có kiểm soát, timeout, `continue-on-error`, `always()`, artifact khi fail, cleanup, và concurrency để tránh run cũ đè run mới.

```yaml
name: CI with controlled failure handling

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout source
        uses: actions/checkout@v6

      - name: Install dependencies with retry
        shell: bash
        run: |
          retry() {
            local max=3
            local delay=5
            local attempt=1

            until "$@"; do
              if [ "$attempt" -ge "$max" ]; then
                echo "::error::Command failed after ${attempt} attempts: $*"
                return 1
              fi

              echo "::warning::Attempt ${attempt} failed. Retrying in ${delay}s..."
              sleep "$delay"
              attempt=$((attempt + 1))
              delay=$((delay * 2))
            done
          }

          retry npm ci

      - name: Run tests
        id: tests
        continue-on-error: true
        run: npm test

      - name: Upload diagnostics
        if: ${{ always() }}
        uses: actions/upload-artifact@v4
        with:
          name: diagnostics-${{ github.run_id }}
          path: |
            test-results/
            coverage/
            logs/
          retention-days: 7

      - name: Fail the job when tests fail
        if: ${{ steps.tests.outcome == 'failure' }}
        run: |
          echo "::error::Tests failed. Xem artifact diagnostics-${{ github.run_id }} để chẩn đoán."
          exit 1

      - name: Cleanup temporary resources
        if: ${{ always() && !cancelled() }}
        run: ./scripts/cleanup.sh

  notify:
    needs: test
    if: ${{ failure() }}
    runs-on: ubuntu-latest
    steps:
      - name: Escalate to on-call
        run: |
          echo "Gửi Slack, email, hoặc mở incident ở đây"
```

Điểm đáng chú ý trong workflow này:

- `concurrency` giúp tránh run cũ làm bẩn kết quả mới.
- `timeout-minutes` ngăn job treo vô hạn.
- `continue-on-error: true` giữ job sống đủ lâu để thu thập artifact.
- `steps.tests.outcome` cho phép bạn fail thật sau khi đã chụp đủ dữ liệu.
- `always() && !cancelled()` giúp cleanup không chạy vô nghĩa trên run đã bị hủy.
- `failure()` ở job `notify` tạo đường đi rõ ràng cho escalation.

## Quy trình áp dụng

<Steps>
<Step>

**1. Phân loại lỗi trước khi làm gì khác**

Xem log và tự hỏi: đây là transient hay permanent. Nếu chưa rõ, hãy coi như transient trong một phạm vi nhỏ, nhưng phải đặt giới hạn retry rõ ràng.

</Step>

<Step>

**2. Đặt retry budget và timeout**

Retry chỉ có giá trị khi có số lần tối đa, khoảng đợi giữa các lần, và tổng thời gian tối đa. Đồng thời đặt `timeout-minutes` để job không thể treo mãi.

</Step>

<Step>

**3. Giữ lại bằng chứng đủ dùng**

Nếu fail có thể xảy ra, hãy upload log, report, screenshot, hoặc trace. Artifact nên được tạo càng sớm càng tốt, không đợi đến lúc job gần kết thúc mới chuẩn bị.

</Step>

<Step>

**4. Cleanup tài nguyên tạm**

Dọn container, preview environment, file tạm, và secret ngắn hạn. Cleanup nên idempotent và nên chạy dù bước trước fail, trừ khi run đã bị hủy.

</Step>

<Step>

**5. Escalate khi vượt ngưỡng**

Khi retry budget hết hoặc lỗi là permanent, dừng tự động hóa và báo cho người trực. Một thông báo tốt phải nói rõ run nào fail, fail ở đâu, và artifact nào cần xem trước.

</Step>
</Steps>

## Best practices

- Retry chỉ cho lỗi transient và thao tác idempotent.
- Giới hạn retry rõ ràng. Không retry vô hạn.
- Dùng backoff tăng dần thay vì retry dồn dập.
- Đặt `timeout-minutes` cho job có thể chờ lâu.
- Dùng `always()` cho cleanup và artifact, không dùng bừa cho mọi step.
- Dùng `always() && !cancelled()` khi cleanup không nên chạy nếu run đã bị hủy.
- Đặt `concurrency.cancel-in-progress: true` cho workflow deploy hoặc workflow dễ sinh run cũ lỗi thời.
- Gắn `id` cho step quan trọng để đọc `steps.<id>.outcome`.
- Upload artifact sớm nếu dữ liệu có nguy cơ mất.
- Đặt tên artifact có run ID hoặc SHA để tra cứu dễ hơn.
- Khi fail thật, hãy fail thật. Đừng để `continue-on-error` biến lỗi production thành job xanh giả.
- Viết log theo kiểu hành động được, không chỉ in ra stack trace rời rạc.

## Troubleshooting

| Triệu chứng | Nguyên nhân hay gặp | Cách kiểm tra | Hướng xử lý |
|-------------|---------------------|---------------|-------------|
| Job xanh dù test đỏ | Step dùng `continue-on-error` nhưng không có bước fail lại | Xem `steps.<id>.outcome` và log cuối job | Thêm gate step `exit 1` sau khi đã upload artifact |
| Artifact không xuất hiện | Step upload không chạy vì job đã fail trước đó hoặc đường dẫn sai | Kiểm tra thứ tự step và glob `path` | Đặt upload trong `if: ${{ always() }}` và kiểm tra lại path |
| Workflow treo đến timeout | `always()` bám vào bước nặng hoặc bước mở đầu | Xem step nào chờ lâu hoặc kẹt network | Chuyển sang `if: ${{ always() && !cancelled() }}` hoặc rút gọn phạm vi `always()` |
| Retry vẫn fail liên tục | Lỗi permanent nhưng bị xử lý như transient | So sánh log giữa các run, kiểm tra cùng input có fail giống nhau không | Bỏ retry, sửa root cause, rồi chạy lại |
| Run bị hủy khi push commit mới | `concurrency.cancel-in-progress: true` | Nhìn trạng thái `cancelled` trên run cũ | Đây là hành vi mong muốn; đổi `group` nếu muốn các nhánh không tự hủy nhau |
| Cleanup không chạy | Bị đặt sau step fail nhưng không có status check phù hợp | Xem điều kiện `if:` của step cleanup | Dùng `if: ${{ always() && !cancelled() }}` hoặc tách cleanup riêng |
| Không biết lỗi là transient hay permanent | Artifact/log không đủ, hoặc thiếu retry budget rõ ràng | Kiểm tra log, artifact, thời điểm lỗi | Tăng chất lượng artifact và ghi lại số lần retry đã thử |

## Tài liệu tham khảo

- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
- [Evaluate expressions in workflows and actions](https://docs.github.com/en/actions/reference/evaluate-expressions-in-workflows-and-actions)
- [Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Store and share data with workflow artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts)
- [actions/upload-artifact](https://github.com/actions/upload-artifact)
- [actions/download-artifact](https://github.com/actions/download-artifact)
