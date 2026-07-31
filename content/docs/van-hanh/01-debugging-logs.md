---
title: "Debugging và logs"
description: "Chẩn đoán workflow GitHub Actions bằng log, debug logging, grouping và tái hiện cục bộ."
---

<Callout type="info" title="Phạm vi của trang này">
  Trang này tập trung vào cách đọc log, bật debug logging, ghi log an toàn và tái hiện lỗi của GitHub Actions. Ở đây, "runner" là máy thực thi job, còn "annotation" là ghi chú có thể bấm được trong giao diện GitHub để nhảy tới file và dòng lỗi.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
- [Khi nào nên bật debug logs](#khi-nào-nên-bật-debug-logs)
- [Quy trình chẩn đoán](#quy-trình-chẩn-đoán)
  - [Xác định tín hiệu lỗi](#xác-định-tín-hiệu-lỗi)
  - [Bật debug logging](#bật-debug-logging)
  - [Gom nhóm và ẩn dữ liệu nhạy cảm](#gom-nhóm-và-ẩn-dữ-liệu-nhạy-cảm)
  - [Đối chiếu giữa các lần chạy](#đối-chiếu-giữa-các-lần-chạy)
- [Ví dụ workflow debug hoàn chỉnh](#ví-dụ-workflow-debug-hoàn-chỉnh)
  - [Cách đọc ví dụ](#cách-đọc-ví-dụ)
- [Ghi log rõ ràng và an toàn](#ghi-log-rõ-ràng-và-an-toàn)
  - [Gom nhóm log](#gom-nhóm-log)
  - [Ẩn secret](#ẩn-secret)
  - [Dùng context khi cần](#dùng-context-khi-cần)
- [Tái hiện cục bộ](#tái-hiện-cục-bộ)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Tổng quan

GitHub Actions cho bạn hai lớp tín hiệu chính khi cần chẩn đoán lỗi.

- **Workflow log** là log mặc định của từng step. Nó cho biết command nào đã chạy, output nào đã in ra và step nào đã fail.
- **Debug logging** là log chi tiết hơn. Nó giúp bạn thấy thêm ngữ cảnh ở mức step và runner.

Khi lỗi xảy ra, mục tiêu không phải là đọc mọi dòng log. Mục tiêu là trả lời ba câu hỏi rất nhanh:

1. Lỗi xuất hiện ở **step nào**.
2. Dữ liệu đầu vào lúc đó là gì, ví dụ branch, commit, matrix, secret đã được mask hay chưa.
3. Lỗi đến từ **code**, **môi trường chạy**, hay **cấu hình workflow**.

<Callout type="warn" title="Đừng bật debug thường trực">
  Debug log tạo thêm nhiễu và có thể làm lộ thêm metadata. Hãy bật nó cho một lần chạy cụ thể, sau đó tắt lại khi đã đủ dữ liệu.
</Callout>

## Khi nào nên bật debug logs

Hãy bật debug logging khi bạn thấy một trong các dấu hiệu sau:

- Job fail không lặp lại được ngay trên máy local.
- Step chỉ fail trên một runner cụ thể, ví dụ `ubuntu-latest` nhưng không fail trên `windows-latest`.
- Lỗi liên quan đến path, quyền truy cập, biến môi trường, service container hoặc thứ tự khởi tạo.
- Bạn nghi ngờ secret bị in ra log nhưng đã bị GitHub che một phần, nên cần thêm ngữ cảnh để xác nhận.
- Job chạy xong nhưng kết quả khác nhau giữa các lần chạy cùng commit.

Nói ngắn gọn: nếu log mặc định không đủ để bạn loại trừ nguyên nhân, hãy bật debug logging sớm thay vì đoán.

## Quy trình chẩn đoán

<Steps>
<Step>

### Xác định tín hiệu lỗi

Bắt đầu từ step fail đầu tiên, không phải step fail cuối cùng.

- Mở workflow run.
- Xem step nào có dấu `x` đỏ.
- Đọc phần annotation và thông báo lỗi ngay tại step đó.
- Ghi lại commit SHA, branch, runner image và matrix values nếu có.

Nếu job có nhiều step fail dây chuyền, lỗi gốc thường nằm ở step đầu tiên tạo ra trạng thái xấu. Các step sau chỉ là hậu quả.

</Step>
<Step>

### Bật debug logging

Có hai cách phổ biến:

- Vào giao diện GitHub và chọn **Re-run jobs** rồi bật **Enable debug logging**.
- Dùng GitHub CLI để rerun với cờ `--debug`.

Ví dụ:

```bash
gh run rerun RUN_ID --debug
gh run rerun RUN_ID --failed --debug
```

Debug logging gồm hai phần khác nhau:

- **Step debug logging**: thêm các dòng `::debug::` và tăng độ chi tiết ở log của step.
- **Runner diagnostic logging**: thêm log nội bộ của runner vào gói log tải về.

Nếu bạn chỉ thấy `::debug::` mà không thấy file chẩn đoán của runner, có thể bạn mới bật step debug logging chứ chưa xem đúng log archive.

</Step>
<Step>

### Gom nhóm và ẩn dữ liệu nhạy cảm

Khi log bắt đầu dài, hãy chia theo cụm công việc. Ví dụ: chuẩn bị môi trường, cài dependency, chạy test, upload artifact.

Trong cùng bước, hãy ẩn secret trước khi in bất kỳ biến liên quan nào. Nếu bạn in giá trị trước rồi mới mask, dữ liệu đã lộ là không thu hồi được.

Nếu cần in một đoạn script hoặc dữ liệu thô có thể chứa `::warning::` hay `::error::`, hãy tạm dừng workflow command bằng `::stop-commands::`.

</Step>
<Step>

### Đối chiếu giữa các lần chạy

So sánh run lỗi với run xanh trên cùng commit hoặc cùng thay đổi gần nhất.

Ưu tiên đối chiếu các điểm sau:

- `github.ref` và `github.sha`.
- `runner.os` và image runner.
- `matrix` values nếu job dùng matrix.
- Port, host và readiness check của service.
- Khác biệt giữa secret, variable và environment.

Nếu cùng một commit nhưng kết quả khác nhau, nguyên nhân thường nằm ở môi trường, dữ liệu ngoài repo hoặc thứ tự chạy chứ không phải source code thuần túy.

</Step>
</Steps>

## Ví dụ workflow debug hoàn chỉnh

Workflow dưới đây là một ví dụ chạy được. Nó có manual trigger, dùng `workflow_dispatch`, in ra bối cảnh cơ bản, nhóm log theo cụm và mask secret nếu có.

> Để thấy đầy đủ step debug logging và runner diagnostic logging của GitHub, hãy tạo secret hoặc variable `ACTIONS_STEP_DEBUG=true` và `ACTIONS_RUNNER_DEBUG=true` ở repository, rồi re-run workflow với debug logging.

```yaml
name: Debugging và logs demo

on:
  workflow_dispatch:
    inputs:
      verbose:
        description: "In thêm log mô phỏng"
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  debug-example:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Hiển thị bối cảnh
        run: |
          echo "::group::Bối cảnh chạy"
          echo "actor=${{ github.actor }}"
          echo "event=${{ github.event_name }}"
          echo "ref=${{ github.ref }}"
          echo "sha=${{ github.sha }}"
          echo "runner.os=${{ runner.os }}"
          echo "workspace=$GITHUB_WORKSPACE"
          echo "::endgroup::"

      - name: In thêm log khi bật verbose
        if: ${{ inputs.verbose }}
        run: |
          echo "::notice title=Verbose::Đã bật chế độ verbose"
          echo "Đây là dòng log mô phỏng cho việc lần theo luồng chạy."

      - name: Chỉ chạy khi debug logging của GitHub đang bật
        if: ${{ runner.debug == '1' }}
        run: |
          echo "::debug::runner.debug đang bật"
          echo "::debug::Hãy đối chiếu bước này với log bình thường để thấy độ chi tiết tăng lên."

      - name: Mask secret an toàn
        env:
          SAMPLE_SECRET: ${{ secrets.DEMO_SECRET }}
        run: |
          if [ -n "$SAMPLE_SECRET" ]; then
            echo "::add-mask::$SAMPLE_SECRET"
            echo "Đã thêm mask cho DEMO_SECRET"
          else
            echo "Không có DEMO_SECRET trong repository, bước này vẫn chạy bình thường."
          fi

      - name: Ghi nhận lỗi có chủ đích
        run: |
          if [ "${{ inputs.verbose }}" = "true" ]; then
            echo "::warning file=src/app.js,line=12::Thiếu giá trị cấu hình mô phỏng"
          fi
          printf '%s\n' "log line 1" "log line 2" "log line 3"

      - name: Tóm tắt
        if: always()
        run: |
          {
            echo "## Kết luận chạy"
            echo "- Commit: ${{ github.sha }}"
            echo "- Ref: ${{ github.ref }}"
            echo "- Runner: ${{ runner.os }}"
          } >> "$GITHUB_STEP_SUMMARY"
```

### Cách đọc ví dụ

- Step **Hiển thị bối cảnh** giúp bạn biết run đang đứng trên commit và runner nào.
- Step **Chỉ chạy khi debug logging của GitHub đang bật** cho thấy cách dùng `runner.debug` để tách riêng logic chẩn đoán.
- Step **Mask secret an toàn** minh họa nguyên tắc: mask trước, in sau.
- Step **Ghi nhận lỗi có chủ đích** tạo annotation bằng `::warning::` để bạn thấy file và dòng bị đánh dấu.

## Ghi log rõ ràng và an toàn

### Gom nhóm log

`::group::` và `::endgroup::` tạo khối log có thể thu gọn trong giao diện GitHub Actions. Điều này rất hữu ích khi một step sinh nhiều output, ví dụ cài dependency, chạy test hoặc in trạng thái service.

Ví dụ:

```bash
echo "::group::Cài dependency"
npm ci
echo "::endgroup::"
```

Quy tắc nhỏ nhưng rất hiệu quả:

- Tên group nên mô tả **giai đoạn** và **đối tượng** đang xử lý.
- Mỗi group nên bao trùm một việc rõ ràng, không nên nhét cả job vào một group.
- Nếu group quá dài, chia tiếp thành các group con theo từng công đoạn.

### Ẩn secret

`::add-mask::` dùng để che một chuỗi trong log. Nó rất quan trọng khi bạn phải in biến môi trường, token tạm thời hoặc giá trị sinh ra trong lúc chạy.

Ví dụ:

```bash
echo "::add-mask::$API_TOKEN"
echo "token length=${#API_TOKEN}"
```

Lưu ý quan trọng:

- Hãy thêm mask **trước** khi in giá trị đó ra màn hình.
- Mask chỉ áp dụng cho đúng chuỗi bạn đã đăng ký. Nếu bạn biến đổi nó, ví dụ cắt bớt, encode khác đi hoặc ghép chuỗi mới, phần biến đổi đó có thể không được che.
- Mask log **không** thay thế việc lọc dữ liệu trước khi ghi vào artifact, step summary hoặc file output.

### Dùng context khi cần

Khi cần hiểu workflow đang chạy trong bối cảnh nào, hãy in các context nhỏ, chọn lọc thay vì dump toàn bộ object.

Các context hay dùng nhất là:

- `github`: thông tin về event và run.
- `runner`: thông tin về máy runner.
- `matrix`: biến của job matrix.
- `job` và `steps`: trạng thái trong job hiện tại.

Ví dụ an toàn hơn là chỉ in các trường cần thiết:

```yaml
- name: Print selected context fields
  run: |
    echo "actor=${{ github.actor }}"
    echo "ref=${{ github.ref }}"
    echo "sha=${{ github.sha }}"
    echo "runner=${{ runner.os }}"
```

<Callout type="warn" title="Cẩn thận khi dump toàn bộ context">
  `github` context có thể chứa dữ liệu nhạy cảm. Nếu cần serialize object để debug, hãy chỉ làm trong môi trường kiểm soát chặt và nhớ mask các giá trị nhạy cảm trước.
</Callout>

<Accordion title="Khi nào nên dùng stop-commands?">
  Dùng `::stop-commands::` khi bạn cần in ra nội dung thô mà không muốn GitHub hiểu nhầm nó là workflow command. Ví dụ: dump script sinh tự động, nội dung JSON từ bên ngoài hoặc output có thể chứa chuỗi giống `::warning::`.

  Ví dụ:

  ```bash
  token="$(uuidgen)"
  echo "::stop-commands::$token"
  cat generated-script.sh
  echo "::$token::"
  ```

  Token phải duy nhất cho từng lần chạy. Nếu dùng lại token cũ, bạn có thể vô tình mở lại command processing ở thời điểm không mong muốn.
</Accordion>

## Tái hiện cục bộ

Tái hiện cục bộ giúp bạn rút ngắn vòng lặp debug, nhất là khi lỗi nằm ở command shell, dependency hoặc file config.

Các bước thực tế thường là:

1. Lấy log thật của run lỗi bằng giao diện GitHub hoặc GitHub CLI.
2. Rút workflow về một nhánh hoặc file tối thiểu chỉ còn phần gây lỗi.
3. Chạy lại bằng công cụ local như `act` nếu lỗi không phụ thuộc quá nhiều vào hạ tầng GitHub.
4. So sánh output local với output trên GitHub để tìm điểm lệch.

Ví dụ với GitHub CLI:

```bash
gh run view RUN_ID --log-failed
gh run download RUN_ID
```

Ví dụ với `act`:

```bash
act workflow_dispatch -W .github/workflows/debugging-logs.yml
```

<Callout type="idea" title="Tái hiện cục bộ không phải là bản sao hoàn hảo">
  `act` rất hữu ích để bắt lỗi logic và shell script, nhưng nó không mô phỏng hoàn toàn GitHub-hosted runner. Image runner, service container networking, permissions và một số tích hợp đặc thù có thể khác nhau.
</Callout>

<Accordion title="Nếu lỗi chỉ xuất hiện trên GitHub-hosted runner thì sao?">
  Hãy ưu tiên dữ liệu từ log thật của GitHub và thu hẹp workflow xuống một bản tối thiểu. Trong nhiều trường hợp, sự khác nhau nằm ở image runner, quyền truy cập network, cache hoặc service container chứ không nằm ở code ứng dụng.
</Accordion>

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| Không thấy dòng `::debug::` | Chưa bật `ACTIONS_STEP_DEBUG=true`, hoặc chưa rerun với debug logging | Bật debug logging ở repository rồi re-run job |
| Log vẫn lộ một phần secret | Mask được thêm sau khi dữ liệu đã in, hoặc giá trị đã bị biến đổi | Gọi `::add-mask::` trước khi in và tránh transform secret rồi mới mask |
| Group log không thu gọn đúng | Thiếu `::endgroup::`, hoặc command nằm ở step khác | Đảm bảo `group` và `endgroup` nằm trong cùng step và cùng shell |
| Kết quả rerun khác lần trước | Commit, matrix, secret, runner image hoặc service state thay đổi | Đối chiếu `github.sha`, `github.ref`, `runner.os` và cấu hình service |
| Local chạy được nhưng GitHub fail | `act` và runner thật khác nhau về image và môi trường | Dùng `act` để rút ngắn vòng lặp, nhưng xác nhận cuối cùng trên GitHub |
| Annotation không hiện ở đúng file | `file`, `line` hoặc `col` truyền sai | Kiểm tra đường dẫn tương đối và số dòng bắt đầu từ 1 |

<Accordion title="Vì sao rerun có thể không giống lần đầu?">
  GitHub rerun thường giữ lại `GITHUB_SHA` và `GITHUB_REF` của run gốc, nhưng môi trường xung quanh vẫn có thể khác nếu secret thay đổi, runner image được cập nhật hoặc dữ liệu ngoài repo đã đổi. Vì vậy, hãy so sánh log theo bối cảnh chứ không chỉ theo commit.
</Accordion>

## Best Practices

- Bật debug logging có chủ đích và tắt lại ngay sau khi xong việc.
- Chỉ in những context cần thiết. Tránh dump toàn bộ object nếu không thật sự cần.
- Nhóm log theo từng giai đoạn: checkout, setup, build, test, publish.
- Mask secret trước khi in bất kỳ biến liên quan nào.
- Dùng `GITHUB_STEP_SUMMARY` để ghi kết luận ngắn gọn, thay vì nhét mọi thứ vào console log.
- Dùng annotation cho lỗi có vị trí rõ ràng, ví dụ file và line, để người đọc bấm là tới đúng chỗ.
- Khi cần tái hiện lỗi, tạo workflow tối thiểu trước. Đừng debug trên một workflow quá lớn nếu chỉ có một step đáng ngờ.
- Nếu workflow chạy trên nhiều matrix, ghi rõ giá trị matrix trong log để tránh nhầm giữa các biến thể.

Tránh các anti-pattern sau:

- `set -x` toàn cục trên script có secret.
- In toàn bộ `env` hoặc `github` context lên log production.
- Dùng một group khổng lồ che toàn bộ job, vì nó làm log khó đọc hơn.
- Để debug logging bật vĩnh viễn trong repository.
- Dùng log để thay thế test. Log giúp chẩn đoán, còn test mới xác nhận hành vi.

## Tài liệu tham khảo

- [Enabling debug logging](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/enabling-debug-logging)
- [Workflow commands for GitHub Actions](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions)
- [Re-running workflows and jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
- [Contexts reference](https://docs.github.com/en/actions/learn-github-actions/contexts)
- [Viewing workflow run logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs)
