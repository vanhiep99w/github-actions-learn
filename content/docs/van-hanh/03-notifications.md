---
title: "Notifications"
description: "Gửi thông báo trạng thái workflow GitHub Actions tới GitHub, chat, email hoặc webhook mà không tạo nhiễu."
---

<Callout type="info">
  Trang này tập trung vào thông báo vận hành cho GitHub Actions: báo khi workflow thành công hoặc thất bại, đẩy tín hiệu vào GitHub native notifications, comment lên issue hoặc pull request, và gửi ra Slack, Teams, email hoặc webhook. "Alert" là thông báo có hành động rõ ràng. "Noise" là thông báo thừa, trùng lặp hoặc không liên quan.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
- [Khi nào nên phát thông báo](#khi-nào-nên-phát-thông-báo)
  - [Sau thành công](#sau-thành-công)
  - [Khi thất bại](#khi-thất-bại)
- [Kênh thông báo native của GitHub](#kênh-thông-báo-native-của-github)
  - [Notifications trong GitHub UI](#notifications-trong-github-ui)
  - [Comment trên issue và pull request](#comment-trên-issue-và-pull-request)
- [Kênh thông báo ra bên ngoài](#kênh-thông-báo-ra-bên-ngoài)
  - [workflow dispatch cho tác vụ thủ công](#workflow-dispatch-cho-tác-vụ-thủ-công)
  - [Slack, Teams, email hoặc webhook](#slack-teams-email-hoặc-webhook)
- [Thiết kế alert không gây nhiễu](#thiết-kế-alert-không-gây-nhiễu)
  - [Lọc theo branch, event và path](#lọc-theo-branch-event-và-path)
  - [Giảm trùng lặp](#giảm-trùng-lặp)
  - [Dùng secrets an toàn](#dùng-secrets-an-toàn)
- [Thông tin cần có trong alert](#thông-tin-cần-có-trong-alert)
- [YAML mẫu](#yaml-mẫu)
  - [Mẫu 1: gửi alert khi job thất bại](#mẫu-1-gửi-alert-khi-job-thất-bại)
  - [Mẫu 2: comment lên pull request bằng workflow dispatch](#mẫu-2-comment-lên-pull-request-bằng-workflow-dispatch)
- [Vận hành và troubleshooting](#vận-hành-và-troubleshooting)
  - [Vận hành hàng ngày](#vận-hành-hàng-ngày)
  - [Troubleshooting thường gặp](#troubleshooting-thường-gặp)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Tổng quan

GitHub Actions không có một nút "send notification" duy nhất cho mọi trường hợp. Thay vào đó, bạn ghép nhiều cơ chế lại với nhau: điều kiện `if`, secrets, comment API, webhook của bên thứ ba, và các bộ lọc của workflow. Mục tiêu là chỉ phát tín hiệu khi thật sự cần người trực xử lý.

Một quy tắc thực tế là: thông báo thành công chỉ dành cho những mốc quan trọng, như deploy production hoặc hoàn tất backup đêm. Còn thông báo thất bại nên gắn với hành động tiếp theo, ví dụ triage lỗi, rollback, hoặc mở ticket.

<Steps>
<Step>
Chọn một kênh chính cho từng lớp sự cố: GitHub comment cho luồng làm việc trong repo, Slack/Teams cho on-call, email cho báo cáo ít khẩn cấp, webhook cho hệ thống bên ngoài.
</Step>
<Step>
Giảm bớt tín hiệu trước khi gửi: lọc branch, path, event và chỉ gửi từ một job đại diện.
</Step>
<Step>
Bảo vệ dữ liệu nhạy cảm bằng secrets và quyền tối thiểu.
</Step>
<Step>
Kiểm tra bằng một lần chạy thử có chủ đích, rồi mới bật cho production.
</Step>
</Steps>

<Callout type="warn" title="Đừng biến notification thành log thứ hai">
  Không gửi payload GitHub event nguyên khối sang Slack, email hoặc Teams. Chỉ gửi các trường cần thiết. Nếu bạn cần chi tiết hơn, hãy dẫn người đọc sang run log hoặc run URL.
</Callout>

## Khi nào nên phát thông báo

Thông báo tốt là thông báo trả lời được câu hỏi: "Người nhận cần làm gì tiếp theo?" Nếu không có hành động rõ ràng, thông báo thường chỉ tạo noise.

### Sau thành công

Thông báo thành công phù hợp với các mốc có ý nghĩa vận hành, chẳng hạn:

- Deploy production đã hoàn tất.
- Backup hoặc sync dữ liệu đã chạy xong.
- Một job kiểm tra định kỳ đã xác nhận hệ thống khỏe.

Nếu pipeline chạy rất nhiều lần mỗi ngày, đừng gửi success cho mọi lần chạy. Hãy chỉ thông báo khi có thay đổi trạng thái quan trọng, ví dụ lần deploy đầu tiên trong ngày hoặc lần chạy sau một incident.

### Khi thất bại

Thông báo thất bại hữu ích khi nó giúp người trực phản ứng nhanh hơn, ví dụ:

- Build chính trên `main` thất bại.
- Lint, test hoặc security scan chặn merge.
- Deploy production không hoàn tất.

Thông báo nên nói rõ nơi lỗi xảy ra, ai cần xem, và link nào cần mở trước.

## Kênh thông báo native của GitHub

Kênh native là các tín hiệu nằm ngay trong GitHub: Actions tab, Checks tab, issue thread, pull request thread, và notification inbox của GitHub. Ưu điểm của nhóm này là không cần thêm hệ thống ngoài nếu team đã sống trong repo mỗi ngày.

### Notifications trong GitHub UI

GitHub có sẵn luồng notification của chính nó. Khi workflow gắn kết với issue hoặc pull request, người theo dõi thread đó sẽ nhìn thấy cập nhật trong giao diện GitHub và có thể nhận thông báo theo thiết lập cá nhân của họ.

Cách dùng thực tế thường là:

- Gắn kết quả chạy vào thread có sẵn bằng comment hoặc status update.
- Mention `@user` hoặc `@team` nếu bạn thật sự cần kéo người chịu trách nhiệm vào cuộc.
- Dùng tên workflow và job rõ ràng để kết quả dễ đọc trong tab Actions.

Đây là lựa chọn tốt khi người dùng chính của thông báo là contributor trong repo, không phải hệ thống on-call bên ngoài.

### Comment trên issue và pull request

Comment là cách đơn giản nhất để biến một kết quả CI thành cuộc hội thoại. Trong GitHub, pull request cũng là một issue về mặt API, nên endpoint issue comment dùng được cho cả issue lẫn pull request.

Bạn nên dùng comment khi:

- Cần để lại ngữ cảnh gần với công việc đang diễn ra.
- Muốn người review nhìn thấy lỗi ngay trong PR.
- Muốn có một thread cố định để cập nhật lại thay vì tạo comment mới mỗi lần chạy.

<Callout type="idea" title="Khi nào nên cập nhật comment cũ">
  Nếu workflow có thể chạy lại nhiều lần trên cùng một issue hoặc PR, hãy tìm comment đã tồn tại rồi update nó. Cách này giảm spam và làm thread gọn hơn.
</Callout>

Tham khảo API chính thức của GitHub cho issue comment: [REST API endpoints for issue comments](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment).

## Kênh thông báo ra bên ngoài

Kênh ra bên ngoài phù hợp với đội on-call, ops, hoặc stakeholder không sống thường xuyên trong GitHub. Ở nhóm này, bạn cần ưu tiên an toàn, khả năng xoay vòng secret, và payload ngắn gọn.

### workflow dispatch cho tác vụ thủ công

`workflow_dispatch` là trigger thủ công. Nó không tự sinh thông báo, nhưng rất hữu ích để vận hành các workflow gửi thông báo theo yêu cầu, ví dụ:

- Gửi lại alert sau khi triage xong.
- Đăng comment tóm tắt lên issue hoặc pull request.
- Chạy một job nhắc nhở trong incident drill.

Trang chính thức về trigger này nằm trong tài liệu sự kiện của GitHub Actions: [workflow_dispatch](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch).

### Slack, Teams, email hoặc webhook

Nếu bạn cần kênh ngoài GitHub, webhook là cách đơn giản và an toàn nhất để bắt đầu. Slack và Teams đều có dạng incoming webhook hoặc connector tương tự. Email thường đi qua nhà cung cấp bên ngoài như SES, SendGrid, Mailgun hoặc một action đã được kiểm tra kỹ.

Khuyến nghị an toàn:

- Lưu URL webhook hoặc token gửi mail trong `secrets`.
- Chỉ gửi dữ liệu cần thiết cho người nhận.
- Dùng action chính thức hoặc pin action bên thứ ba theo commit SHA.
- Không in secret ra log, kể cả trong chế độ debug.

Tham khảo chính thức về secrets: [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

## Thiết kế alert không gây nhiễu

Notification tốt thường là notification đã được lọc trước khi gửi. Filter càng rõ, người nhận càng ít bị ngập trong tín hiệu không liên quan.

### Lọc theo branch, event và path

Các filter phổ biến nhất là:

- Chỉ chạy trên `main` hoặc `release/**`.
- Chỉ chạy khi event là `push`, `pull_request`, hoặc `workflow_dispatch`.
- Chỉ chạy khi thay đổi chạm vào file hoặc thư mục thật sự quan trọng.

Ví dụ, một workflow thông báo cho production thường chỉ cần `main`:

```yaml
on:
  push:
    branches:
      - main
```

Nếu bạn chỉ cần thông báo khi thay đổi vào thư mục ứng dụng, thêm `paths` để tránh chạy thừa.

### Giảm trùng lặp

Trùng lặp là nguồn noise lớn nhất trong notification của CI/CD. Các cách giảm trùng lặp hiệu quả nhất là:

- Chỉ gửi thông báo từ một job tổng hợp, không gửi từ từng matrix job.
- Update lại comment cũ thay vì tạo comment mới.
- Dùng `concurrency` để hủy các run cũ khi có commit mới cùng nhánh.
- Bỏ qua rerun không cần thiết bằng `github.run_attempt` nếu team không muốn nhận lại cùng một alert.

<Accordion title="Khi nào dùng pull_request_target?">
  `pull_request_target` cho phép workflow có quyền ghi lên repo, nhưng nó cũng làm bề mặt tấn công rộng hơn nếu bạn checkout và chạy code không tin cậy. Chỉ dùng nó cho workflow rất hẹp, ví dụ chỉ comment hoặc gắn label, và tuyệt đối không chạy mã từ PR một cách mù quáng.
</Accordion>

### Dùng secrets an toàn

Secrets là nơi đặt webhook URL, token API, hoặc khóa gửi mail. Khi dùng secrets, nhớ các điểm sau:

- Secrets không nên được echo ra log.
- Với pull request từ fork, secrets thường không được chuyển vào runner.
- `GITHUB_TOKEN` và secrets khác có phạm vi khác nhau; hãy cấp quyền tối thiểu bằng `permissions`.
- Nếu cần truyền secret vào command line, hãy quote cẩn thận để tránh shell expand ngoài ý muốn.

Tham khảo chính thức về quyền và truy cập secret trong workflow syntax: [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) và tài liệu về [secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

## Thông tin cần có trong alert

Một alert hữu ích nên cho người nhận đủ ngữ cảnh để hành động trong 10 đến 30 giây đầu tiên. Không nên bắt họ mở nhiều tab chỉ để hiểu chuyện gì xảy ra.

| Trường nên có | Vì sao cần |
|---|---|
| Tên workflow và job | Xác định ngay phần nào của pipeline gặp vấn đề |
| Repository và branch | Biết lỗi xảy ra ở đâu |
| Commit SHA hoặc PR number | Truy ngược chính xác phiên bản gây ra lỗi |
| Trạng thái run và attempt | Phân biệt lần chạy đầu tiên với rerun |
| Run URL | Một click là vào được log hoặc Checks |
| Bước thất bại gần nhất | Rút ngắn thời gian tìm nguyên nhân |
| Hành động tiếp theo | Ví dụ: rollback, retry, hoặc gắn người phụ trách |
| Mức độ ưu tiên | Biết có cần ping on-call ngay hay không |

Một mẫu message ngắn gọn thường đủ tốt:

```text
[repo] [workflow] failed on main
- job: test
- step: integration tests
- run: https://github.com/org/repo/actions/runs/123456789
- action: xem log và retry nếu lỗi môi trường
```

## YAML mẫu

### Mẫu 1: gửi alert khi job thất bại

Ví dụ này gửi thông báo thành công hoặc thất bại ra một webhook kiểu Slack. Mẫu này cố ý chỉ gửi khi chạy trên `main` để tránh spam từ branch feature.

```yaml
name: ci-notify

on:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Notify success
        if: success() && github.ref == 'refs/heads/main'
        env:
          WEBHOOK_URL: ${{ secrets.NOTIFY_WEBHOOK_URL }}
        run: |
          curl -fsS -X POST \
            -H 'Content-Type: application/json' \
            --data "$(cat <<'JSON'
          {
            "text": "✅ ${{ github.repository }} / ${{ github.workflow }} succeeded on `${{ github.ref_name }}`. Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          }
          JSON
          )" \
            "$WEBHOOK_URL"

      - name: Notify failure
        if: failure() && github.ref == 'refs/heads/main'
        continue-on-error: true
        env:
          WEBHOOK_URL: ${{ secrets.NOTIFY_WEBHOOK_URL }}
        run: |
          curl -fsS -X POST \
            -H 'Content-Type: application/json' \
            --data "$(cat <<'JSON'
          {
            "text": "❌ ${{ github.repository }} / ${{ github.workflow }} failed on `${{ github.ref_name }}`. Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          }
          JSON
          )" \
            "$WEBHOOK_URL"
```

Điểm đáng chú ý:

- `if: success()` và `if: failure()` giúp chỉ gửi đúng trạng thái cần thiết.
- `github.run_id` tạo đường link quay lại đúng run.
- `continue-on-error: true` ở bước notify giúp alert không che mất nguyên nhân thất bại gốc.
- Webhook URL nằm trong secret `NOTIFY_WEBHOOK_URL`.

### Mẫu 2: comment lên pull request bằng workflow dispatch

Mẫu này dùng `workflow_dispatch` để maintainer gửi hoặc cập nhật comment thủ công lên issue hoặc pull request. Vì pull request cũng là issue trong API, cùng một endpoint là đủ.

```yaml
name: comment-manual

on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: "Số issue hoặc pull request"
        required: true
        type: string
      message:
        description: "Nội dung comment"
        required: true
        type: string

permissions:
  issues: write

jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - name: Create or update comment
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const owner = context.repo.owner;
            const repo = context.repo.repo;
            const issue_number = Number(core.getInput('issue_number'));
            const message = core.getInput('message');
            const marker = '<!-- ops-notification -->';
            const body = `${marker}\n${message}\n\nRun: ${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;

            const comments = await github.paginate(github.rest.issues.listComments, {
              owner,
              repo,
              issue_number,
              per_page: 100,
            });

            const existing = comments.find((comment) =>
              comment.user?.type === 'Bot' && comment.body?.includes(marker)
            );

            if (existing) {
              await github.rest.issues.updateComment({
                owner,
                repo,
                comment_id: existing.id,
                body,
              });
              core.info(`Updated comment ${existing.id}`);
            } else {
              await github.rest.issues.createComment({
                owner,
                repo,
                issue_number,
                body,
              });
              core.info('Created new comment');
            }
```

Mẫu này giải quyết hai bài toán cùng lúc:

- `workflow_dispatch` cho phép ops gửi thông báo theo yêu cầu.
- Marker `<!-- ops-notification -->` giúp cập nhật comment cũ thay vì tạo comment mới.

Nếu muốn comment tự động khi failure, bạn chỉ cần thay trigger sang `pull_request` hoặc `workflow_run` và giữ nguyên logic comment.

## Vận hành và troubleshooting

### Vận hành hàng ngày

Một quy trình vận hành bền vững thường gồm bốn việc:

1. Xác định rõ ai là người nhận thông báo cho từng loại sự cố.
2. Giữ số kênh ở mức tối thiểu. Một lớp sự cố chỉ nên có một kênh chính.
3. Rà lại comment và webhook payload định kỳ để tránh message cũ, format lỗi hoặc link chết.
4. Test lại sau mỗi lần đổi secret, đổi branch filter, hoặc đổi permissions.

Bạn có thể dùng `workflow_dispatch` để kiểm tra định kỳ luồng thông báo mà không cần tạo lỗi thật.

### Troubleshooting thường gặp

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| Không thấy alert nào | `if` quá chặt, secret sai tên, hoặc workflow không chạy trên nhánh đó | Kiểm tra branch filter, event filter, và phần `permissions` |
| Comment không tạo được | `issues: write` chưa bật, hoặc token không có quyền trên PR từ fork | Cấp quyền tối thiểu đúng chỗ, hoặc giới hạn workflow chỉ cho repo nội bộ |
| Alert bị spam nhiều lần | Mỗi matrix job đều gửi riêng, hoặc rerun tạo message mới | Chỉ gửi từ một job tổng hợp và thêm marker để update comment cũ |
| Alert lộ thông tin nhạy cảm | Payload chứa secret, token hoặc biến môi trường đầy đủ | Rút gọn payload, mask dữ liệu nhạy cảm và không in raw context |
| Webhook trả 4xx hoặc 5xx | Sai schema payload, endpoint hết hạn, hoặc giới hạn rate | Kiểm tra format JSON, xoay webhook, và thử lại bằng `workflow_dispatch` |
| Step notify làm hỏng job chính | Notification step fail theo và che mất lỗi gốc | Thêm `continue-on-error: true` cho bước notify hoặc tách notify sang job riêng |

<Callout type="warn" title="Forked pull request là vùng rủi ro">
  Với pull request từ fork, secrets thường không có sẵn. Nếu bạn cần comment hoặc notify từ PR của fork, hãy thiết kế riêng một luồng an toàn. Đừng chạy code không tin cậy với quyền ghi vào repo.
</Callout>

## Tài liệu tham khảo

- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Events that trigger workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)
- [workflow_dispatch](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch)
- [Evaluate expressions in workflows and actions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions)
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [REST API endpoints for issue comments](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment)
