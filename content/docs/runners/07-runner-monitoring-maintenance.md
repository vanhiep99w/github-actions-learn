---
title: "Giám sát và bảo trì runner"
description: "Runbook theo dõi hàng đợi, sức khỏe, tài nguyên, cập nhật và xử lý sự cố cho self-hosted runner GitHub Actions."
---

<Callout type="info" title="Phạm vi">
  Tài liệu này dành cho đội platform hoặc on-call vận hành **self-hosted runner** ở cấp repository hoặc organization. GitHub-hosted runner do GitHub bảo trì; với loại runner đó, hãy tập trung vào trạng thái workflow và [GitHub Status](https://www.githubstatus.com/) thay vì hệ điều hành của máy chạy.
</Callout>

## Mục lục

- [Phạm vi và nguyên tắc vận hành](#phạm-vi-và-nguyên-tắc-vận-hành)
- [Tín hiệu cần theo dõi](#tín-hiệu-cần-theo-dõi)
  - [Hàng đợi và trạng thái runner](#hàng-đợi-và-trạng-thái-runner)
  - [Kết quả và thời lượng job](#kết-quả-và-thời-lượng-job)
  - [Mức bão hòa tài nguyên](#mức-bão-hòa-tài-nguyên)
- [Thu thập dữ liệu quan sát](#thu-thập-dữ-liệu-quan-sát)
  - [Quan sát trong GitHub UI](#quan-sát-trong-github-ui)
  - [Kiểm kê runner qua REST API](#kiểm-kê-runner-qua-rest-api)
  - [Đo vòng đời job bằng API và webhook](#đo-vòng-đời-job-bằng-api-và-webhook)
  - [Thu thập log và host metrics](#thu-thập-log-và-host-metrics)
- [Log và kiểm tra sức khỏe runner](#log-và-kiểm-tra-sức-khỏe-runner)
  - [Đọc thư mục chẩn đoán diag](#đọc-thư-mục-chẩn-đoán-diag)
  - [Kiểm tra service](#kiểm-tra-service)
  - [Kiểm tra kết nối chính thức](#kiểm-tra-kết-nối-chính-thức)
- [Dashboard, SLO và cảnh báo](#dashboard-slo-và-cảnh-báo)
  - [Dashboard tối thiểu](#dashboard-tối-thiểu)
  - [SLO gợi ý](#slo-gợi-ý)
  - [Quy tắc cảnh báo gợi ý](#quy-tắc-cảnh-báo-gợi-ý)
- [Lập kế hoạch năng lực](#lập-kế-hoạch-năng-lực)
- [Chính sách bảo trì vòng đời](#chính-sách-bảo-trì-vòng-đời)
  - [Cập nhật runner](#cập-nhật-runner)
  - [Dọn disk và workspace](#dọn-disk-và-workspace)
  - [Rotation và thay thế ephemeral runner](#rotation-và-thay-thế-ephemeral-runner)
  - [Sao lưu cấu hình mà không sao chép credential](#sao-lưu-cấu-hình-mà-không-sao-chép-credential)
- [Runbook xử lý sự cố](#runbook-xử-lý-sự-cố)
  - [Runner offline](#runner-offline)
  - [Runner hoặc job bị stuck](#runner-hoặc-job-bị-stuck)
  - [Queue tăng nhanh](#queue-tăng-nhanh)
  - [Disk full](#disk-full)
- [Checklist bảo trì](#checklist-bảo-trì)
  - [Mỗi ngày hoặc mỗi ca on-call](#mỗi-ngày-hoặc-mỗi-ca-on-call)
  - [Mỗi tuần](#mỗi-tuần)
  - [Mỗi tháng](#mỗi-tháng)
  - [Trước và sau maintenance window](#trước-và-sau-maintenance-window)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)
- [Học tiếp](#học-tiếp)

## Phạm vi và nguyên tắc vận hành

Một runner chỉ thực sự khỏe khi **job phù hợp có thể bắt đầu và hoàn tất đúng hạn**. Process runner còn chạy chưa đủ để kết luận hệ thống khỏe. Ví dụ, runner có thể hiện `online` nhưng mọi slot đều bận, disk gần đầy hoặc label không khớp với job đang đợi.

Dùng ba lớp quan sát cùng lúc:

1. **Control plane của GitHub:** trạng thái `online`/`offline`, cờ `busy`, labels, runner group và hàng đợi job.
2. **Vòng đời job:** thời gian chờ, thời gian chạy, conclusion và runner đã nhận job.
3. **Máy chủ:** service, log trong `_diag`, CPU, memory, disk, inode, network và runtime như Docker.

Mọi dashboard và cảnh báo phải phân tách theo **pool có cùng khả năng định tuyến**. Một pool thường được xác định bởi runner group và tập labels quan trọng như `linux`, `x64`, `gpu` hoặc `production`. Tổng số runner toàn organization có thể vẫn lớn trong khi pool `gpu` không còn slot nào.

<Callout type="warn" title="Không có một metric GitHub duy nhất cho runner health">
  REST API trả về trạng thái và thuộc tính runner; API hoặc webhook trả về vòng đời job. CPU, memory, disk và inode phải lấy từ hệ điều hành hoặc nền tảng hạ tầng. Các metric trong tài liệu này là **metric suy ra** từ dữ liệu chính thức, không phải tên metric tích hợp sẵn do GitHub phát hành.
</Callout>

## Tín hiệu cần theo dõi

### Hàng đợi và trạng thái runner

| Tín hiệu | Cách tính hoặc nguồn | Ý nghĩa vận hành |
|---|---|---|
| Queue depth | Số `workflow_job` đang ở trạng thái `queued`, phân theo labels hoặc pool | Nhu cầu hiện tại chưa được phục vụ |
| Queue time | `started_at - created_at` của job; nếu collector chỉ có sự kiện, dùng thời điểm nhận `in_progress - queued` và ghi rõ đây là xấp xỉ | Trải nghiệm chờ của người dùng CI |
| Online | REST runner có `status: online` | Runner đang kết nối với GitHub |
| Busy | REST runner có `status: online` và `busy: true` | Runner đang thực thi một job |
| Idle | REST runner có `status: online` và `busy: false` | Runner sẵn sàng nhận job, nhưng chỉ khi labels và group khớp |
| Offline | REST runner có `status: offline` | Máy tắt, application không chạy hoặc không kết nối được với GitHub |
| Busy ratio | `busy runners / online runners` theo pool trong một cửa sổ thời gian | Mức sử dụng slot và phần headroom còn lại |

GitHub UI gọi ba trạng thái là **Idle**, **Active** và **Offline**. REST API biểu diễn cùng thông tin bằng `status` (`online` hoặc `offline`) kết hợp với boolean `busy`.

Cần đọc queue time theo percentile thay vì chỉ dùng trung bình. `p95` cho biết 95% job bắt đầu nhanh hơn ngưỡng đó và làm lộ các đợt cao điểm mà trung bình dễ che mất.

<Callout type="info" title="Giới hạn định tuyến quan trọng">
  Khi có runner online và idle phù hợp, GitHub gửi job cho runner đó. Nếu runner không nhận job đã gán trong 60 giây, job được đưa lại vào queue. Nếu không có runner phù hợp, job có thể đợi đến khi có runner online; job còn queued quá 24 giờ sẽ thất bại.
</Callout>

### Kết quả và thời lượng job

Theo dõi ít nhất các trường sau cho từng workflow, job, labels và runner pool:

- **Success ratio:** số job có `conclusion: success` chia cho tổng job đã hoàn tất.
- **Infrastructure failure ratio:** tỷ lệ job thất bại do runner, network, disk, image hoặc toolchain nền tảng. Chỉ số này cần phân loại từ log; không đồng nhất mọi `failure` với lỗi runner.
- **Job duration:** `completed_at - started_at`, theo `p50`, `p95` và `p99`.
- **Cancellation và timeout:** số job `cancelled` hoặc `timed_out`. Tăng đột biến có thể là triệu chứng queue dài, job treo hoặc timeout cấu hình quá thấp.
- **Requeue hoặc pickup chậm:** job quay lại queue hoặc chờ lâu dù có runner idle phù hợp. Kiểm tra application log và kết nối trước khi tăng capacity.

Success ratio của toàn bộ CI vẫn hữu ích cho đội phát triển, nhưng không phải SLO thuần của nền tảng runner. Dashboard on-call nên hiển thị song song **tất cả conclusion** và **failure đã quy trách nhiệm cho hạ tầng**.

### Mức bão hòa tài nguyên

GitHub không cung cấp host metrics cho self-hosted runner. Cài agent giám sát của tổ chức trên máy hoặc lấy telemetry từ VM, Kubernetes và container runtime.

| Tài nguyên | Tín hiệu nên thu thập | Dấu hiệu cần điều tra |
|---|---|---|
| CPU | Utilization, load average, CPU throttling nếu chạy container | CPU cao kéo dài đồng thời job duration tăng |
| Memory | Available memory, working set, swap, OOM kill | Memory khả dụng thấp, swap tăng hoặc process bị OOM |
| Disk | Dung lượng còn trống theo filesystem, tốc độ tăng, I/O latency | Workspace đầy, checkout lỗi hoặc job chậm bất thường |
| Inode | Phần trăm inode đã dùng | Còn dung lượng nhưng không tạo được file mới |
| Network | DNS/TLS error, packet loss, latency và outbound HTTPS | Runner chập chờn, tải action/artifact/update thất bại |
| Container runtime | Docker service, image/layer/build cache usage | Container job không khởi động hoặc disk tăng nhanh |
| Process/service | Trạng thái service, restart count, process age | Runner liên tục restart hoặc không có listener |

Ngưỡng phải dựa trên baseline của workload. Ví dụ, CPU 90% trong một build ngắn có thể bình thường. CPU 90% trong 30 phút kèm queue tăng mới là tín hiệu thiếu capacity hoặc job bất thường.

## Thu thập dữ liệu quan sát

### Quan sát trong GitHub UI

Đối với runner cấp organization:

1. Mở organization, chọn **Settings**.
2. Chọn **Actions → Runners**.
3. Kiểm tra tên runner, labels, runner group và trạng thái **Idle**, **Active** hoặc **Offline**.
4. Mở runner cụ thể để đối chiếu cấu hình và job đang chạy nếu giao diện hiển thị.

Đối với runner cấp repository, mở repository rồi vào **Settings → Actions → Runners**. Quyền xem và quản lý phụ thuộc phạm vi đăng ký: repository owner, organization owner hoặc repository admin theo trường hợp GitHub quy định.

Để điều tra job:

1. Mở tab **Actions** của repository.
2. Chọn workflow run và job.
3. Ghi lại thời điểm, duration, conclusion, runner name và labels.
4. Đọc step **Set up job**, step lỗi đầu tiên và các dòng cuối của job log.
5. Dùng **Download log archive** hoặc `gh run view` nếu cần lưu bằng chứng của incident.

```bash
# Xem toàn bộ log của một run hoặc chỉ log step thất bại.
gh run view RUN_ID --repo OWNER/REPO --log
gh run view RUN_ID --repo OWNER/REPO --log-failed
```

Workflow UI giúp điều tra từng ca. Với nhiều repository hoặc cần SLO dài hạn, dùng API/webhook và một hệ thống metrics tập trung.

### Kiểm kê runner qua REST API

Endpoint chính thức ở cấp organization là `GET /orgs/{org}/actions/runners`. Endpoint tương ứng ở cấp repository là `GET /repos/{owner}/{repo}/actions/runners`. Response hiện hành có các trường như `name`, `os`, `status`, `busy`, `ephemeral`, `version` và `labels`.

Ví dụ sau dùng GitHub CLI để liệt kê toàn bộ runner của organization:

```bash
ORG="octo-org"

gh api --paginate \
  -H "Accept: application/vnd.github+json" \
  "/orgs/${ORG}/actions/runners?per_page=100" \
  --jq '.runners[] | [
    .name,
    .os,
    .status,
    (.busy | tostring),
    (.ephemeral | tostring),
    .version,
    ([.labels[].name] | join(","))
  ] | @tsv'
```

Đếm runner theo trạng thái mà không giả định tên metric:

```bash
ORG="octo-org"

gh api --paginate \
  "/orgs/${ORG}/actions/runners?per_page=100" \
  --jq '.runners[] | if .status == "offline" then "offline" elif .busy then "busy" else "idle" end' \
  | sort | uniq -c
```

Token chỉ cần quyền đọc phù hợp. Với fine-grained token ở cấp organization, dùng quyền **Self-hosted runners: read**. Không đặt token trong script, command line được commit hoặc log của workflow; ưu tiên GitHub App và secret manager cho collector chạy lâu dài.

<Callout type="warn" title="Không suy luận capacity chỉ từ tổng idle">
  Một runner `idle` nhưng thiếu label hoặc không thuộc runner group mà repository được phép dùng sẽ không nhận job. Collector phải giữ labels, group và repository scope để ghép đúng queue với đúng pool.
</Callout>

### Đo vòng đời job bằng API và webhook

Có hai cách chính thức:

- **REST API workflow jobs:** lấy `status`, `conclusion`, `started_at`, `completed_at`, `labels`, `runner_id`, `runner_name` và `runner_group_name` của job.
- **Webhook `workflow_job`:** nhận các action vòng đời `queued`, `in_progress` và `completed`. Cách này phù hợp với dashboard gần thời gian thực và autoscaling.

Một pipeline telemetry thực tế nên làm như sau:

1. Xác thực chữ ký webhook bằng `X-Hub-Signature-256` trước khi xử lý payload.
2. Chống trùng bằng `X-GitHub-Delivery` vì delivery có thể được gửi lại.
3. Lưu repository, workflow/job ID, action, labels, runner, conclusion và các timestamp có trong payload.
4. Tính `queue_seconds`, `duration_seconds` và success ratio trong hệ thống metrics.
5. Phân nhóm theo pool định tuyến; không đưa branch, commit SHA hoặc job ID thành label metric có cardinality cao.
6. Định kỳ đối soát với REST API để sửa dữ liệu thiếu do webhook trễ hoặc delivery thất bại.

Nếu chỉ dùng thời điểm collector nhận webhook, queue time và duration là giá trị gần đúng vì có độ trễ truyền webhook. Ưu tiên timestamp của đối tượng job khi payload cung cấp, và lưu cả thời điểm nhận để đo độ trễ collector.

REST API workflow jobs cho phép truy vấn lại một run:

```bash
OWNER="octo-org"
REPO="octo-repo"
RUN_ID="123456789"

gh api --paginate \
  "/repos/${OWNER}/${REPO}/actions/runs/${RUN_ID}/jobs?filter=all&per_page=100" \
  --jq '.jobs[] | {
    id,
    name,
    status,
    conclusion,
    started_at,
    completed_at,
    runner_name,
    runner_group_name,
    labels
  }'
```

`filter=all` giữ cả các attempt cũ. Điều này quan trọng khi đội ngũ re-run workflow và cần tính đúng failure hoặc duration theo từng attempt.

### Thu thập log và host metrics

Thiết kế đường đi dữ liệu tách biệt với chính runner pool:

```text
GitHub API/webhook ──► collector ──► metrics store ──► dashboard/alert
Runner _diag/journal ─► log agent ─► log store ─────► tìm kiếm/incident
Host/VM/Kubernetes ───► agent ─────► metrics store
```

Các yêu cầu tối thiểu:

- Log agent phải theo dõi file mới xuất hiện trong `_diag`, không chỉ một filename cố định.
- Gắn metadata ít biến động như runner pool, environment, OS và image version.
- Không đưa token, secret hoặc toàn bộ command line nhạy cảm thành metric label.
- Giới hạn quyền đọc log và thời gian lưu theo chính sách bảo mật của tổ chức.
- Cảnh báo khi collector hoặc log agent ngừng gửi dữ liệu; nếu không, dashboard có thể “xanh” chỉ vì mất telemetry.

Với ephemeral runner, GitHub yêu cầu về mặt vận hành rằng application log phải được chuyển và lưu ở hệ thống bên ngoài để phục vụ chẩn đoán. Runner có thể biến mất ngay sau một job, nên không thể dựa vào disk cục bộ sau incident.

## Log và kiểm tra sức khỏe runner

### Đọc thư mục chẩn đoán diag

Thư mục `_diag` nằm bên trong thư mục đã cài runner:

- `Runner_<UTC timestamp>.log`: hoạt động của listener. Một file mới được tạo mỗi lần application khởi động.
- `Worker_<UTC timestamp>.log`: log chi tiết của từng job do runner xử lý.
- `SelfUpdate...log`: thông tin chi tiết về quá trình tự cập nhật khi có update.
- Log từ `config.sh --check`: vị trí file được in ra sau mỗi lần chạy kiểm tra kết nối.

Các lệnh đọc an toàn trên Linux:

```bash
RUNNER_ROOT="/opt/actions-runner"

# Xem các file mới nhất, không chỉnh sửa nội dung.
ls -lt "${RUNNER_ROOT}/_diag" | head -n 20

# Theo dõi listener log mới nhất.
LATEST_RUNNER_LOG="$(ls -1t "${RUNNER_ROOT}"/_diag/Runner_*.log | head -n 1)"
tail -n 200 -f "${LATEST_RUNNER_LOG}"

# Tìm lỗi phổ biến trong log gần đây.
grep -E -i 'error|exception|fail|update' "${RUNNER_ROOT}"/_diag/Runner_*.log | tail -n 100
```

Trước khi restart hoặc thay máy, lưu các file liên quan đến incident vào log store. Không đính kèm nguyên archive công khai. Job command và output có thể chứa đường dẫn nội bộ hoặc dữ liệu nhạy cảm dù GitHub có cơ chế mask secret.

### Kiểm tra service

Chạy lệnh trong thư mục cài runner. Trên Linux được cấu hình bằng script chính thức:

```bash
cd /opt/actions-runner
sudo ./svc.sh status

# Đọc đúng tên systemd unit do bộ cài ghi lại.
SERVICE_NAME="$(cat .service)"
sudo systemctl status "${SERVICE_NAME}" --no-pager
sudo journalctl -u "${SERVICE_NAME}" --since "30 minutes ago" --no-pager
sudo journalctl -u "${SERVICE_NAME}" -f
```

Không đoán tên unit vì GitHub có thể cắt tên dài quá 80 ký tự. File `.service` trong runner root là cách ưu tiên để lấy đúng tên.

Trên macOS:

```bash
cd /Users/runner/actions-runner
./svc.sh status
cat .service
```

Trên Windows PowerShell:

```powershell
Set-Location C:\actions-runner
Get-Content .service
Get-Service "actions.runner.*" | Select-Object Name, Status
Get-EventLog -LogName Application -Source ActionsRunnerService -Newest 100
```

`service running` chỉ xác nhận process manager thấy service hoạt động. Vẫn phải đối chiếu runner `online`, log có dòng kết nối và khả năng nhận job.

### Kiểm tra kết nối chính thức

GitHub chính thức hỗ trợ `config.sh --check` hoặc `config.cmd --check`. Lệnh cần URL của repository/organization/enterprise và PAT có quyền workflow phù hợp.

```bash
cd /opt/actions-runner
read -r -s -p "PAT kiểm tra tạm thời: " CHECK_PAT
echo
./config.sh --check \
  --url "https://github.com/octo-org/octo-repo" \
  --pat "${CHECK_PAT}"
unset CHECK_PAT
```

Trên Windows:

```powershell
Set-Location C:\actions-runner
$checkPat = Read-Host "PAT kiểm tra tạm thời" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($checkPat)
try {
  $plainPat = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  .\config.cmd --check --url "https://github.com/octo-org/octo-repo" --pat $plainPat
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable plainPat, checkPat -ErrorAction SilentlyContinue
}
```

Mỗi dịch vụ được kiểm tra sẽ trả `PASS` hoặc `FAIL`; chi tiết nằm trong `_diag`. Dùng token tạm thời, quyền tối thiểu và thu hồi sau khi kiểm tra. Trên hệ điều hành đa người dùng, command line có thể bị process khác quan sát trong lúc lệnh chạy; chỉ thực hiện trong phiên bảo trì được kiểm soát.

<Callout type="warn" title="Không gọi Runner.Listener --check trực tiếp">
  Tài liệu GitHub hiện hành hướng dẫn dùng `config.sh --check` hoặc `config.cmd --check`. Không dựa vào `./bin/Runner.Listener --check` trong automation vận hành vì đây không phải giao diện kiểm tra được tài liệu công khai cam kết hỗ trợ.
</Callout>

Không tắt xác minh TLS để “sửa” production. GitHub có biến `GITHUB_ACTIONS_RUNNER_TLS_NO_VERIFY=1` cho chẩn đoán, nhưng chính GitHub không khuyến nghị vì làm mất bảo vệ riêng tư và toàn vẹn. Hãy cài CA hợp lệ vào trust store và sửa proxy/TLS inspection.

## Dashboard, SLO và cảnh báo

### Dashboard tối thiểu

Một dashboard dùng được cho on-call nên có các panel sau, lọc được theo organization, repository, pool và labels:

1. Queue depth hiện tại và `p50`/`p95`/`p99` queue time.
2. Số runner `online idle`, `online busy` và `offline`.
3. Busy ratio và số job hoàn tất mỗi phút.
4. Success, failure, cancelled, timed out; thêm infrastructure failure nếu đã phân loại.
5. `p50`/`p95`/`p99` job duration theo workflow/job.
6. CPU, memory available, disk free, inode free và Docker disk usage.
7. Runner version phân bố theo pool và số ngày từ release mới nhất.
8. Tuổi của telemetry cuối cùng từ API collector, webhook receiver, host agent và log agent.

Đặt annotation trên dashboard cho release runner, thay image, thay firewall, thay labels/group và incident GitHub Actions. Annotation giúp phân biệt regression do thay đổi với tăng tải tự nhiên.

### SLO gợi ý

SLO dưới đây là điểm khởi đầu, không phải cam kết của GitHub. Đo baseline 2–4 tuần rồi điều chỉnh theo mức quan trọng của pipeline.

| SLI | SLO khởi đầu gợi ý | Ghi chú |
|---|---|---|
| Queue latency | 95% job của pool bắt đầu trong 2 phút, theo cửa sổ 28 ngày | Tách job chờ approval/concurrency khỏi thiếu runner nếu có thể |
| Pool availability | 99,9% phút có ít nhất một runner online phù hợp cho pool bắt buộc luôn sẵn sàng | Không phù hợp cho pool cố ý scale-to-zero |
| Runner infrastructure success | 99,5% job không thất bại vì runner/network/disk/image | Cần taxonomy nguyên nhân rõ ràng |
| Telemetry freshness | 99,9% phút collector có dữ liệu mới trong 5 phút | Tránh “mù giám sát” |
| Update compliance | 100% runner được cập nhật trước hạn GitHub chặn queue | Đặt deadline nội bộ sớm hơn 30 ngày |

Ví dụ error budget cho queue SLO 95% là 5% số job được phép chờ từ 2 phút trở lên trong cửa sổ. Khi tiêu thụ budget quá nhanh, ưu tiên sửa capacity hoặc routing trước các tối ưu không cấp thiết.

### Quy tắc cảnh báo gợi ý

Dùng cảnh báo nhiều mức và yêu cầu tín hiệu kéo dài để tránh nhiễu:

| Cảnh báo | Warning gợi ý | Critical gợi ý | Hành động đầu tiên |
|---|---|---|---|
| Queue tăng | `p95 > 2 phút` trong 15 phút | Job lâu nhất `> 10 phút` và không có idle phù hợp | Kiểm tra labels/group rồi capacity |
| Pool không sẵn sàng | Không có idle 10 phút trong giờ cao điểm | Không có runner online 5 phút | Mở runbook runner offline |
| Offline | Một runner offline 10 phút | Tỷ lệ offline vượt 20% pool hoặc mất redundancy | Kiểm tra service/network/host |
| Resource saturation | CPU > 85% hoặc memory available < 15% trong 15 phút | OOM, memory < 5%, disk/inode free < 10% | Giảm tải hoặc thay runner |
| Disk | Free < 20% | Free < 10% hoặc dự báo đầy trong 4 giờ | Mở runbook disk full |
| Job duration | `p95` cao hơn baseline 50% | Nhiều job vượt timeout/SLO | So sánh resource và thay đổi gần nhất |
| Runner update | Release mới 21 ngày nhưng pool chưa rollout | 27 ngày hoặc có critical security update | Rollout ngay, tăng capacity tạm |
| Telemetry stale | Không có dữ liệu 5 phút | Không có dữ liệu 15 phút | Sửa collector/agent trước |

Các giá trị phần trăm và thời gian trên là gợi ý. Pool một runner cần cảnh báo khác pool một trăm runner. Cảnh báo nên route tới owner của pool và kèm link dashboard, danh sách labels, runner đang offline cùng runbook tương ứng.

## Lập kế hoạch năng lực

Lập capacity riêng cho từng pool định tuyến. Dùng dữ liệu giờ cao điểm thay vì trung bình cả ngày.

Một ước lượng ban đầu dựa trên định luật Little:

```text
concurrency trung bình = tốc độ job đến × thời lượng job trung bình
runner cần thiết ≈ concurrency giờ cao điểm / utilization mục tiêu
```

Ví dụ, pool nhận 4 job/phút và mỗi job chạy trung bình 3 phút:

```text
concurrency trung bình = 4 × 3 = 12 slot
runner ở utilization 70% ≈ 12 / 0,70 = 18 runner, làm tròn lên
```

Con số 18 chỉ là điểm bắt đầu. Hoàn thiện kế hoạch theo quy trình:

1. Phân nhóm job theo labels/group thực sự dùng trong `runs-on`.
2. Lấy arrival rate và duration ở `p50`, `p95` cho giờ cao điểm, theo ngày trong tuần.
3. Chọn utilization mục tiêu. Pool có workload burst thường cần giữ 20–40% headroom.
4. Mô phỏng burst như mở pull request hàng loạt, lịch chạy đầu giờ hoặc release.
5. Tính thời gian provision runner. Autoscaler chậm cần nhiều warm capacity hơn.
6. Kiểm tra giới hạn ngoài runner: concurrency, environment approval, API rate limit, registry, cache server và database test.
7. Load test bằng workflow an toàn trước khi áp dụng production.
8. Xem lại hàng tháng hoặc sau khi queue SLO bị vi phạm.

Busy ratio gần 100% kéo dài kèm queue tăng là dấu hiệu thiếu slot. Busy ratio thấp nhưng queue vẫn tăng thường là routing sai, runner group không cho repository truy cập, label không khớp hoặc job đang `waiting` vì approval/concurrency.

Đối với Kubernetes, GitHub khuyến nghị Actions Runner Controller (ARC) là giải pháp Kubernetes chuẩn để autoscale. Với autoscaling tự xây, webhook delivery có thể trễ; không dùng webhook như nguồn duy nhất mà không có reconciliation.

## Chính sách bảo trì vòng đời

### Cập nhật runner

Mặc định self-hosted runner tự cập nhật khi có phiên bản mới. GitHub cho biết runner nhận update khi được gán job, hoặc trong vòng một tuần kể từ release nếu không có job. Quá trình này chỉ cập nhật **runner application**; đội vận hành vẫn phải vá OS, Docker và toolchain riêng.

Nếu đăng ký bằng `--disableupdate`, thường dùng cho ephemeral container image, policy bắt buộc là:

- cập nhật trong **30 ngày kể từ khi bất kỳ bản runner mới nào được phát hành**;
- major, minor và patch đều được tính là update khả dụng;
- quá 30 ngày, GitHub Actions không queue job vào runner cũ;
- với critical security update, GitHub có thể ngừng queue job cho đến khi cập nhật, không chờ hết 30 ngày.

<Callout type="error" title="Deadline 30 ngày là giới hạn bắt buộc">
  Không dùng 30 ngày làm lịch rollout. Hãy đặt deadline nội bộ 14–21 ngày và cảnh báo ở ngày 21/27 để còn thời gian sửa lỗi. Theo dõi release tại repository chính thức [`actions/runner`](https://github.com/actions/runner/releases).
</Callout>

Chính sách rollout đề xuất:

1. Subscribe release notification và mở change record tự động.
2. Build image mới từ release chính thức; kiểm tra checksum/digest được công bố.
3. Cập nhật OS package, CA, Docker và toolchain theo lịch riêng.
4. Triển khai canary vào pool không chạy deploy quan trọng.
5. Chạy smoke workflow kiểm tra checkout, cache/artifact, container nếu có và truy cập tài nguyên bắt buộc.
6. Theo dõi queue time, success và duration ít nhất một chu kỳ tải đại diện.
7. Rollout theo từng đợt, luôn giữ capacity khỏe.
8. Xác nhận REST API không còn runner version cũ và `_diag/SelfUpdate*` không có lỗi.

Nếu canary lỗi, dừng rollout và thay bằng image đã biết tốt **chỉ khi phiên bản đó vẫn còn được GitHub chấp nhận**. Không rollback qua critical security update. Trong đa số trường hợp, sửa image và roll forward an toàn hơn giữ phiên bản cũ sát hạn 30 ngày.

### Dọn disk và workspace

Ưu tiên ephemeral runner vì máy bị hủy sau một job sẽ giảm state tích lũy. Với persistent runner, workflow phải tự dọn build output và service đã tạo. Maintenance cleanup chỉ là lớp bảo vệ cuối.

Trước khi xóa:

1. Kiểm tra runner `busy: false` trong API/UI.
2. Dừng service để ngăn job mới được nhận.
3. Xác nhận không còn `Runner.Worker` hoặc process build/container của job.
4. Chuyển log cần giữ ra hệ thống ngoài.
5. Liệt kê dữ liệu sẽ xóa trước, sau đó mới chạy lệnh xóa.

GitHub không cung cấp thao tác “drain” nguyên tử cho từng persistent runner trong REST endpoint được nêu ở tài liệu này. Giữa lúc kiểm tra idle và dừng service vẫn có race nhỏ. Thực hiện trong maintenance window, quan sát log và dừng ngay khi runner còn idle.

Các lệnh điều tra trên Linux:

```bash
RUNNER_ROOT="/opt/actions-runner"

# Filesystem, inode và thư mục lớn.
df -h "${RUNNER_ROOT}"
df -i "${RUNNER_ROOT}"
du -x -h --max-depth=2 "${RUNNER_ROOT}/_work" | sort -h | tail -n 30

# Nếu runner chạy container jobs.
docker system df
```

Ví dụ dọn workspace repository cũ, nhưng giữ các thư mục runner quản lý. Luôn chạy lệnh `-print` để review trước:

```bash
RUNNER_ROOT="/opt/actions-runner"

find "${RUNNER_ROOT}/_work" \
  -mindepth 1 -maxdepth 1 -type d \
  ! -name '_actions' ! -name '_temp' ! -name '_tool' \
  -mtime +7 -print

# Chỉ chạy sau khi runner idle, service đã dừng và danh sách trên đã được duyệt.
find "${RUNNER_ROOT}/_work" \
  -mindepth 1 -maxdepth 1 -type d \
  ! -name '_actions' ! -name '_temp' ! -name '_tool' \
  -mtime +7 -exec rm -rf -- {} +
```

Không dùng `rm -rf /opt/actions-runner/_work/*` khi runner đang chạy. Không xóa mù `_tool`, `_actions`, Docker volume hoặc cache dùng chung. Với Docker, dùng `docker system df -v` xác định owner và policy retention trước; `docker system prune -a --volumes` có blast radius lớn và không nên là cron mặc định.

Sau cleanup:

```bash
cd /opt/actions-runner
sudo ./svc.sh start
sudo ./svc.sh status
df -h .
```

Xác nhận runner trở lại `online`, chạy smoke job và theo dõi disk growth. Nếu cùng dữ liệu đầy trở lại nhanh, sửa workflow/image thay vì tăng tần suất xóa.

### Rotation và thay thế ephemeral runner

GitHub khuyến nghị ephemeral runner cho autoscaling. Đăng ký với `--ephemeral` làm runner tự de-register sau khi xử lý một job; automation của bạn phải hủy VM/container và tạo bản mới từ image sạch.

Một vòng đời production nên là:

```text
image đã kiểm thử → tạo runner → đăng ký ephemeral → nhận một job
→ gửi log ra ngoài → de-register → hủy máy → tạo runner thay thế
```

Các guardrail bắt buộc:

- Forward `_diag` ra ngoài trước khi production rollout.
- Không đưa registration token hoặc credential vào image.
- Lấy token ngắn hạn lúc provision và đăng ký qua kênh secret an toàn.
- Đặt TTL cho runner không nhận được job để tránh tài nguyên mồ côi.
- Reconcile runner trong GitHub với VM/pod thực tế.
- Theo dõi provisioning failure và thời gian từ `queued` đến runner sẵn sàng.

GitHub tự xóa registration của persistent self-hosted runner nếu nó không kết nối quá 14 ngày. Ephemeral runner offline bị tự xóa sau 1 ngày. Không dùng các khoảng này thay cho garbage collection chủ động.

Để rotation persistent runner, tạo và smoke-test máy mới trước. Sau đó xác nhận máy cũ idle, dừng service, xóa đăng ký bằng quy trình **Remove** trong GitHub hoặc REST API, rồi hủy máy cũ. Không clone nguyên disk runner sang máy mới.

### Sao lưu cấu hình mà không sao chép credential

Không backup toàn bộ thư mục cài runner. Các file như `.credentials`, `.credentials_rsaparams` và dữ liệu đăng ký cục bộ không được sao chép sang runner khác. Registration token, remove token và PAT cũng không được đưa vào backup.

Chỉ lưu các thành phần tái tạo được:

- Terraform/Pulumi/CloudFormation hoặc manifest Kubernetes;
- script bootstrap không chứa secret;
- tên runner group và labels mong muốn;
- OS/image version, package manifest và checksum;
- cấu hình firewall/proxy/CA không chứa private key;
- service customization, log-agent và metrics-agent config đã loại secret;
- dashboard, alert rule, SLO và retention policy;
- tài liệu owner, escalation và maintenance window.

Khôi phục đúng nghĩa là **provision máy sạch và đăng ký runner mới bằng token mới**, không phải phục hồi identity cũ. Kiểm thử khôi phục định kỳ trong sandbox và đo recovery time.

## Runbook xử lý sự cố

Trước mọi runbook, tạo incident timeline gồm thời điểm phát hiện, pool/labels bị ảnh hưởng, queue lâu nhất, thay đổi gần nhất và người chỉ huy. Giữ bằng chứng trước khi restart hoặc xóa.

### Runner offline

**Mục tiêu:** khôi phục capacity mà không phá job có thể vẫn đang chạy cục bộ.

1. **Xác định phạm vi.** Một runner, cả pool hay nhiều organization cùng lỗi? Nếu nhiều pool không liên quan cùng lỗi, kiểm tra [GitHub Status](https://www.githubstatus.com/).
2. **Đối chiếu GitHub.** Xem **Settings → Actions → Runners** hoặc gọi REST API. Ghi lại `status`, `busy`, version, labels và lần telemetry cuối.
3. **Kiểm tra host.** Xác nhận VM/máy còn chạy, clock đồng bộ, disk/inode còn trống và DNS hoạt động.
4. **Kiểm tra service.** Chạy `./svc.sh status`, `systemctl status`/`journalctl`, `launchctl` hoặc `Get-Service` theo OS.
5. **Bảo vệ job.** Nếu local log cho thấy Worker còn thực thi job, không restart ngay. So sánh job trong GitHub và chờ/cancel có kiểm soát.
6. **Kiểm tra kết nối.** Chạy `config.sh --check` bằng token tạm thời. Đối chiếu outbound HTTPS 443, proxy, CA và các domain GitHub yêu cầu.
7. **Khôi phục.** Nếu không có job, restart service một lần và theo dõi `Runner_` log:

```bash
cd /opt/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh start
sudo ./svc.sh status
```

8. **Thay thế nếu không ổn định.** Với ephemeral/autoscaled pool, cordon ở lớp hạ tầng rồi hủy instance và tạo bản mới. Với persistent runner, provision máy mới trước khi remove máy cũ.
9. **Xác minh.** Runner phải `online`, smoke job thành công, queue giảm và log forwarding hoạt động.

Escalate cho network/platform nếu `--check` FAIL trên nhiều máy. Escalate cho GitHub Support khi GitHub Status không báo lỗi nhưng nhiều runner ở các mạng độc lập cùng không kết nối và đã có `_diag` đã loại dữ liệu nhạy cảm.

### Runner hoặc job bị stuck

**Dấu hiệu:** runner `busy` lâu hơn baseline, job không có log mới hoặc queue phía sau tăng.

1. Mở workflow job, ghi job ID, run ID, runner name, thời điểm bắt đầu và dòng log cuối.
2. Kiểm tra timeout/concurrency/environment approval. Job `waiting` không nhất thiết đang chiếm runner.
3. Đọc `Worker_` log tương ứng và service journal. Kiểm tra process con, CPU, memory, I/O và network.
4. Xác định job **đang làm việc chậm** hay **không tiến triển**. CPU/I/O còn hoạt động và log có tiến độ có thể là job dài hợp lệ.
5. Nếu job sai hoặc treo, cancel qua UI hoặc GitHub CLI để GitHub và runner kết thúc có kiểm soát:

```bash
gh run cancel RUN_ID --repo OWNER/REPO
```

6. Chờ trạng thái `cancelled` và process Worker thoát. Chỉ kill process/restart service khi cancel không hoàn tất và đã thu log.
7. Nếu listener không nhận job mới sau khi Worker thoát, restart service rồi chạy smoke job.
8. Phân tích nguyên nhân: timeout thiếu, deadlock test, child process mồ côi, disk/network, Docker daemon hoặc runner bug. Sửa workflow/image trước khi re-run hàng loạt.

Không re-run ngay nhiều bản sao của job treo. Việc đó có thể chiếm hết pool và biến một lỗi job thành incident queue toàn tổ chức.

### Queue tăng nhanh

**Mục tiêu:** phân biệt thiếu capacity với sai routing hoặc cổng chờ khác.

1. Đo queue depth, tuổi job lâu nhất và `p95` queue time theo labels/group.
2. Kiểm tra job đang `queued` hay `waiting`. Environment approval, concurrency group và dependency không được giải quyết bằng cách thêm runner.
3. Lấy danh sách runner API. Đếm `online idle`, `online busy`, `offline` đúng pool.
4. So sánh `runs-on`, labels và runner group access. Chú ý chữ hoa/thường, label cũ và repository không được group cho phép.
5. Nếu có idle phù hợp nhưng job không được nhận, xem `Runner_` log, pickup/requeue và kết nối; nhớ rằng GitHub requeue nếu runner không nhận job được gán trong 60 giây.
6. Nếu mọi runner phù hợp đều busy và khỏe, tăng capacity theo giới hạn an toàn. Với autoscaler, kiểm tra webhook receiver, quota cloud/Kubernetes và thời gian provision.
7. Giảm tải có kiểm soát: tạm hoãn workflow lịch không quan trọng, giới hạn matrix hoặc ưu tiên pipeline release theo chính sách đã duyệt. Không hủy deploy đang chạy chỉ để làm đẹp queue.
8. Theo dõi đến khi tuổi job lâu nhất và `p95` trở về SLO. Job có thể thất bại nếu queued quá 24 giờ; không chờ sát giới hạn mới hành động.
9. Sau incident, cập nhật forecast, headroom, scaling limit và alert theo pool.

### Disk full

**Mục tiêu:** ngăn hỏng thêm job, giữ bằng chứng và giải phóng đúng dữ liệu.

1. Xác nhận filesystem và inode nào đầy:

```bash
df -h
df -i
sudo du -x -h --max-depth=2 /opt/actions-runner | sort -h | tail -n 40
docker system df -v
```

2. Kiểm tra runner đang busy. Nếu job còn chạy, không xóa workspace hoặc container của job đó. Cancel job có kiểm soát nếu nó đang tiếp tục làm đầy disk.
3. Khi runner idle, dừng service để ngăn job mới.
4. Forward `_diag` và incident logs ra ngoài. Nếu disk hoàn toàn đầy, giải phóng một lượng nhỏ từ log đã rotate và được lưu bên ngoài trước.
5. Xác định owner: repository workspace, `_temp`, tool cache, action cache, Docker image/layer/volume, artifact cục bộ hay log hệ thống.
6. Xóa theo retention policy và allowlist. Dùng quy trình review `find ... -print` ở phần dọn workspace; không prune toàn hệ thống một cách mù quáng.
7. Nếu không chắc dữ liệu có an toàn để xóa, thay ephemeral runner hoặc provision persistent runner mới. Đây thường an toàn hơn “phẫu thuật” một host đã tích lũy state.
8. Khởi động service, xác nhận disk/inode, trạng thái online và smoke job.
9. Thêm cảnh báo tốc độ tăng disk, quota workspace hoặc chuyển workload sang ephemeral image.

## Checklist bảo trì

### Mỗi ngày hoặc mỗi ca on-call

- [ ] Không có pool quan trọng mất toàn bộ runner online.
- [ ] Queue time và job lâu nhất nằm trong SLO.
- [ ] Không có cảnh báo disk, inode, OOM hoặc telemetry stale.
- [ ] Infrastructure failure không tăng đột biến.
- [ ] GitHub Status không có incident liên quan Actions.

### Mỗi tuần

- [ ] Review runner offline, restart loop và instance mồ côi.
- [ ] Review `p95` queue time, duration và busy ratio theo pool.
- [ ] Kiểm tra `_diag`/journal forwarding và thử tìm một job bằng runner name/run ID.
- [ ] Review dung lượng `_work`, Docker và tốc độ tăng disk.
- [ ] Kiểm tra release mới của `actions/runner` và trạng thái canary/rollout.
- [ ] Xác nhận smoke workflow cho các capability quan trọng vẫn thành công.

### Mỗi tháng

- [ ] Đối soát runner API với inventory VM/pod và xóa registration mồ côi.
- [ ] Review capacity theo giờ cao điểm, seasonality và kế hoạch release.
- [ ] Vá OS, container runtime, CA và toolchain ngoài runner application.
- [ ] Kiểm thử thay thế một runner từ image/IaC và đăng ký bằng token mới.
- [ ] Review quyền của GitHub App/PAT collector, secret rotation và log access.
- [ ] Review SLO, error budget, alert noise và owner/escalation.
- [ ] Kiểm tra không có runner nào gần giới hạn update bắt buộc 30 ngày.

### Trước và sau maintenance window

- [ ] Thông báo phạm vi, capacity giảm và rollback/roll-forward plan.
- [ ] Xác nhận runner idle trước khi dừng; không restart giữa job.
- [ ] Giữ đủ runner khỏe để phục vụ pipeline quan trọng.
- [ ] Lưu log/telemetry và ghi annotation thay đổi.
- [ ] Sau thay đổi, kiểm tra service, API status, version, disk và network.
- [ ] Chạy smoke job, kiểm tra queue trở lại bình thường rồi đóng change.

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| UI báo `Offline` | Host tắt, service dừng, DNS/proxy/TLS hoặc outbound 443 lỗi | Kiểm tra host/service, đọc `Runner_` log, chạy `config.sh --check`, restart khi không có Worker |
| Service running nhưng UI offline | Listener chưa kết nối, credential/registration lỗi, clock hoặc network | Đọc journal và `_diag`; kiểm tra clock, CA, proxy; thay runner nếu identity hỏng thay vì copy credential |
| UI báo Active/busy quá lâu | Job hợp lệ chạy lâu, deadlock, process con treo, I/O hoặc network | Đọc job log và `Worker_`, kiểm tra resource; cancel có kiểm soát rồi restart nếu cần |
| Queue tăng nhưng có nhiều idle | Labels/group/scope không khớp, job `waiting`, runner không pickup assignment | Ghép queue theo labels/group; kiểm tra `runs-on`, access, concurrency/approval và listener log |
| Queue tăng, mọi runner busy | Peak vượt capacity hoặc autoscaler/provision chậm | Tăng capacity trong quota, giảm workload không quan trọng, cập nhật forecast/headroom |
| Checkout/action/artifact lỗi đồng loạt | DNS, firewall, proxy, TLS inspection hoặc domain GitHub bị chặn | Chạy connectivity check, đối chiếu domain chính thức, sửa CA/firewall; không tắt TLS production |
| `No space left on device` | Workspace, Docker layer/volume, tool cache, log hoặc inode đầy | Dừng nhận job khi idle, giữ log, xác định owner, dọn theo allowlist hoặc thay instance |
| Còn GB trống nhưng không tạo file | Inode cạn | Kiểm tra `df -i`, tìm cây có nhiều file nhỏ, dọn đúng owner rồi thêm inode alert |
| Container job lỗi dù runner online | Docker dừng, permission socket, disk hoặc engine không phù hợp | Kiểm tra `systemctl is-active docker`, quyền service account, `docker system df` và `Worker_` log |
| Runner tự restart lặp lại | Update lỗi, service config, OOM hoặc dependency hệ điều hành | Xem `SelfUpdate`, journal, OOM log; rollback image còn được hỗ trợ hoặc roll forward |
| Runner version cũ không nhận job | Quá 30 ngày sau release hoặc critical security update | Rollout bản mới ngay; xác nhận version qua API và smoke-test |
| Ephemeral runner biến mất, không còn log | Log chỉ nằm trên filesystem tạm | Sửa external log forwarding trước khi tiếp tục production rollout |
| Dashboard không có lỗi nhưng queue thực tế tăng | Collector/webhook/agent mất dữ liệu | Cảnh báo telemetry freshness, kiểm tra webhook delivery và reconcile bằng REST API |

## Tài liệu tham khảo

- [Monitoring and troubleshooting self-hosted runners — GitHub Docs](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/monitor-and-troubleshoot)
- [Configuring the self-hosted runner application as a service — GitHub Docs](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application)
- [Self-hosted runners reference — GitHub Docs](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [REST API endpoints for self-hosted runners — GitHub Docs](https://docs.github.com/en/rest/actions/self-hosted-runners)
- [REST API endpoints for workflow jobs — GitHub Docs](https://docs.github.com/en/rest/actions/workflow-jobs)
- [Webhook event `workflow_job` — GitHub Docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads#workflow_job)
- [Using workflow run logs — GitHub Docs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs)
- [Removing self-hosted runners — GitHub Docs](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/remove-runners)
- [Releases của GitHub Actions Runner](https://github.com/actions/runner/releases)

## Học tiếp

<Cards>
  <Card title="Self-hosted runners" href="/docs/runners/02-self-hosted-runners/" description="Ôn lại cách đăng ký, chạy service và quản lý vòng đời runner trên hạ tầng riêng." />
  <Card title="Labels và runner groups" href="/docs/runners/03-labels-va-runner-groups/" description="Thiết kế pool và định tuyến để queue metrics phản ánh đúng capacity có thể dùng." />
  <Card title="Autoscaling với ARC" href="/docs/runners/05-autoscaling-arc/" description="Mở rộng ephemeral runner trên Kubernetes theo nhu cầu job." />
  <Card title="Bảo mật runner" href="/docs/runners/06-runner-hardening/" description="Giảm quyền, cô lập workload và bảo vệ credential trong quá trình vận hành." />
</Cards>
