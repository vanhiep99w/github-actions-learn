---
title: "Self-hosted runners"
description: "Thiết kế, cài đặt và vận hành GitHub Actions self-hosted runner an toàn trên hạ tầng do bạn quản lý."
---

<Callout type="error" title="Không chạy mã không tin cậy trên runner dùng lâu dài">
  Self-hosted runner có thể giữ lại tiến trình, tệp và quyền truy cập mạng sau một job. Không dùng persistent runner cho pull request từ fork hoặc nguồn không tin cậy. Với workload bắt buộc phải xử lý mã không tin cậy, hãy dùng môi trường dùng một lần, không cấp secret, cô lập mạng và hủy toàn bộ máy sau job.
</Callout>

Self-hosted runner là máy vật lý, máy ảo hoặc container do bạn triển khai để nhận và thực thi job từ GitHub Actions. GitHub điều phối job; bạn chịu trách nhiệm cho máy, hệ điều hành, công cụ, kết nối mạng, chi phí và phần lớn biện pháp cô lập.

## Mục lục

- [Tổng quan](#tổng-quan)
  - [Khi nào nên dùng](#khi-nào-nên-dùng)
  - [Khi nào không nên dùng](#khi-nào-không-nên-dùng)
- [Mô hình trách nhiệm chia sẻ](#mô-hình-trách-nhiệm-chia-sẻ)
- [Yêu cầu và phạm vi đăng ký](#yêu-cầu-và-phạm-vi-đăng-ký)
  - [Yêu cầu cho máy runner](#yêu-cầu-cho-máy-runner)
  - [Chọn phạm vi repository organization hay enterprise](#chọn-phạm-vi-repository-organization-hay-enterprise)
- [Cài đặt và đăng ký Linux](#cài-đặt-và-đăng-ký-linux)
  - [Chuẩn bị trên GitHub và máy Linux](#chuẩn-bị-trên-github-và-máy-linux)
  - [Tải và đăng ký bằng token ngắn hạn](#tải-và-đăng-ký-bằng-token-ngắn-hạn)
  - [Kiểm tra ở chế độ tương tác](#kiểm-tra-ở-chế-độ-tương-tác)
  - [Chạy runner như một service](#chạy-runner-như-một-service)
- [Định tuyến bằng labels](#định-tuyến-bằng-labels)
- [Vòng đời job và runner](#vòng-đời-job-và-runner)
  - [Job được xếp hàng và thực thi](#job-được-xếp-hàng-và-thực-thi)
  - [Persistent runner](#persistent-runner)
  - [Ephemeral runner](#ephemeral-runner)
- [Cập nhật runner](#cập-nhật-runner)
- [Mạng và proxy](#mạng-và-proxy)
  - [Kết nối bắt buộc](#kết-nối-bắt-buộc)
  - [Cấu hình proxy](#cấu-hình-proxy)
- [Bài thực hành với workflow](#bài-thực-hành-với-workflow)
  - [Tạo workflow](#tạo-workflow)
  - [Chạy và kiểm chứng](#chạy-và-kiểm-chứng)
- [Gỡ đăng ký an toàn](#gỡ-đăng-ký-an-toàn)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)
- [Đọc tiếp](#đọc-tiếp)

## Tổng quan

GitHub-hosted runner phù hợp với phần lớn pipeline vì mỗi job nhận một máy mới và GitHub quản lý image. Self-hosted runner đổi sự tiện lợi đó lấy quyền kiểm soát. Ví dụ, một job build firmware cần USB device gắn tại chỗ không thể chạy trên runner tiêu chuẩn, nhưng có thể chạy trên một máy Linux trong phòng lab.

Self-hosted runner không bị tính phí sử dụng GitHub Actions theo cách của GitHub-hosted runner. Tuy nhiên, máy, điện toán đám mây, lưu trữ, băng thông, bản quyền phần mềm và công vận hành vẫn do bạn chi trả.

### Khi nào nên dùng

Chọn self-hosted runner khi có ít nhất một yêu cầu mà GitHub-hosted runner không đáp ứng tốt:

- **Phần cứng chuyên dụng:** GPU, FPGA, thiết bị USB, kiến trúc CPU đặc biệt hoặc nhiều CPU/RAM hơn cấu hình có sẵn.
- **Truy cập mạng riêng:** build cần truy cập package registry, database thử nghiệm hoặc thiết bị chỉ có trong mạng nội bộ.
- **Hệ điều hành và toolchain tùy chỉnh:** image được kiểm soát chặt, compiler độc quyền hoặc cache cục bộ rất lớn.
- **Yêu cầu vị trí dữ liệu:** job phải chạy trong một vùng cloud, datacenter hoặc phân đoạn mạng xác định.
- **Tận dụng năng lực sẵn có:** tổ chức đã có cụm máy build và có đội vận hành chịu trách nhiệm về khả dụng, vá lỗi và giám sát.

Ví dụ, một organization có 30 repository cùng build ứng dụng Android có thể dùng một pool organization-level chứa Android SDK và cache lớn. Chỉ các repository được phép mới được truy cập pool qua runner group.

### Khi nào không nên dùng

Không nên chọn self-hosted runner chỉ vì muốn “miễn phí phút build”. Tổng chi phí sở hữu còn gồm hardening, cập nhật, autoscaling, giám sát và xử lý sự cố.

Ưu tiên GitHub-hosted runner khi:

- workflow chạy được trên image tiêu chuẩn và không cần mạng riêng;
- đội ngũ không có khả năng trực vận hành runner;
- workload đến từ repository công khai hoặc thường xuyên chạy mã PR không tin cậy;
- yêu cầu chính là môi trường sạch cho mỗi job nhưng chưa có hệ thống tạo và hủy máy tự động;
- tải thay đổi mạnh và GitHub-hosted runner đáp ứng đủ hiệu năng.

<Callout type="warn" title="Private không đồng nghĩa với tin cậy">
  Trong repository private hoặc internal, người có quyền fork và mở pull request vẫn có thể đưa mã độc vào job. Chỉ định tuyến các workflow đã kiểm soát đến self-hosted runner và tách pool theo mức độ tin cậy.
</Callout>

## Mô hình trách nhiệm chia sẻ

Self-hosted runner dùng mô hình shared responsibility. Ranh giới quan trọng nhất là GitHub quản lý control plane của Actions, còn tổ chức quản lý execution plane nơi mã thực sự chạy.

| Hạng mục | GitHub chịu trách nhiệm | Bạn chịu trách nhiệm |
|---|---|---|
| Điều phối | Nhận sự kiện, tạo job, xếp hàng và định tuyến theo group/label | Cung cấp đủ runner online và cấu hình quyền truy cập đúng |
| Phần mềm runner | Phát hành ứng dụng `actions/runner` và tự động cập nhật mặc định | Theo dõi phiên bản; quản lý cập nhật nếu tắt tự động |
| Máy thực thi | Không quản lý máy self-hosted | Cấp phát máy, hệ điều hành, CPU/RAM/disk, tài khoản service và chi phí |
| Toolchain | Không đảm bảo công cụ có trên máy của bạn | Cài, vá và kiểm kê Docker, compiler, SDK cùng dependency hệ thống |
| Mạng | Cung cấp endpoint dịch vụ GitHub Actions | Firewall, DNS, proxy, egress allowlist và truy cập tài nguyên nội bộ |
| Bảo mật job | Cung cấp permissions, secrets, environments, groups và audit events | Phân vùng trust, least privilege, bảo vệ secret, làm sạch hoặc hủy máy |
| Khả dụng và log | Hiển thị trạng thái/job log đã gửi lên GitHub | Health check, dung lượng, log runner trong `_diag`, cảnh báo và khôi phục |

Ví dụ, GitHub có thể tự cập nhật binary runner. Việc đó không cập nhật kernel Linux, Docker Engine hoặc Java SDK. Bạn phải vá các thành phần này bằng quy trình quản lý máy của mình.

## Yêu cầu và phạm vi đăng ký

### Yêu cầu cho máy runner

Trước khi đăng ký, kiểm tra các điều kiện sau:

- Hệ điều hành và kiến trúc nằm trong [ma trận được GitHub hỗ trợ](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#requirements-for-self-hosted-runner-machines). Danh sách thay đổi theo thời gian, vì vậy không nên đóng cứng một phiên bản distro vào runbook dài hạn.
- Máy cho phép cài và chạy ứng dụng GitHub Actions runner.
- CPU, RAM và dung lượng đĩa đủ cho workload. Bản thân runner cần ít tài nguyên, nhưng compiler, container image và artifact thường cần nhiều hơn.
- Máy tạo được kết nối HTTPS outbound đến GitHub qua cổng `443`. GitHub không yêu cầu mở cổng inbound để runner nhận job.
- Nếu workflow dùng container action hoặc service container, runner phải là Linux và đã cài Docker.
- Đồng hồ hệ thống, DNS và CA trust store hoạt động đúng. Lệch giờ hoặc TLS interception sai thường làm đăng ký thất bại.
- Có một tài khoản hệ điều hành riêng, không phải `root`, để chạy service. Tài khoản này chỉ nhận các quyền thực sự cần cho build.

<Callout type="idea" title="Bắt đầu với một runner thử nghiệm">
  Dùng một VM không chứa dữ liệu quan trọng, một repository private thử nghiệm và một custom label riêng. Sau khi kiểm chứng routing, log, cập nhật và cleanup, mới mở quyền cho repository production.
</Callout>

### Chọn phạm vi repository organization hay enterprise

Phạm vi đăng ký quyết định nơi quản lý và tập repository có thể dùng runner.

| Phạm vi | Ai quản lý hoặc đăng ký | Phạm vi sử dụng | Khi phù hợp |
|---|---|---|---|
| Repository | Chủ repository cá nhân; hoặc organization owner/admin repository đối với repository thuộc organization | Một repository | Runner gắn với thiết bị hoặc workload duy nhất |
| Organization | Organization owner | Nhiều repository trong organization, theo policy của runner group | Platform team dùng chung pool cho nhiều đội |
| Enterprise | Enterprise owner trên GitHub Enterprise Cloud | Có thể gán cho nhiều organization; organization tiếp tục kiểm soát repository được dùng | Quản trị tập trung cho nhiều organization |

Organization owner có thể cấm hoặc giới hạn việc tạo repository-level self-hosted runner. Với organization/enterprise runner, hãy dùng runner group để chỉ cho phép danh sách repository hoặc workflow cần thiết. Runner không chỉ trở nên an toàn vì được đăng ký ở phạm vi cao hơn; phạm vi càng rộng thì hậu quả khi bị compromise càng lớn.

Nói ngắn gọn: đặt runner ở cấp cao nhất mà **cùng một đội chịu trách nhiệm và cùng một mức độ tin cậy**, sau đó thu hẹp quyền bằng group policy. Không gom production deployment và PR validation vào cùng pool.

## Cài đặt và đăng ký Linux

Các lệnh tải runner chứa phiên bản, kiến trúc và checksum hiện hành. Vì các giá trị này thay đổi theo release, luôn lấy nguyên khối lệnh từ giao diện GitHub thay vì sao chép một URL cũ từ tài liệu nội bộ.

### Chuẩn bị trên GitHub và máy Linux

1. Chọn đúng phạm vi trên GitHub:
   - Repository: **Settings → Actions → Runners → New self-hosted runner**.
   - Organization: **Organization Settings → Actions → Runners → New runner → New self-hosted runner**.
   - Enterprise: dùng trang quản lý runner của enterprise và làm theo hướng dẫn dành cho GitHub Enterprise Cloud.
2. Chọn **Linux** và đúng kiến trúc của máy. Không chọn `x64` cho máy ARM64.
3. Chuẩn bị một tài khoản service riêng, ví dụ `gha-runner`, và thư mục mà tài khoản đó sở hữu. Trên Ubuntu/Debian, một ví dụ là:

```bash
sudo useradd --create-home --shell /bin/bash gha-runner
sudo install -d -o gha-runner -g gha-runner /opt/actions-runner
sudo -iu gha-runner
cd /opt/actions-runner
```

Nếu hệ thống quản lý identity bằng LDAP hoặc image automation, hãy tạo tài khoản theo chuẩn của tổ chức thay vì buộc dùng `useradd`.

### Tải và đăng ký bằng token ngắn hạn

1. Trong phần **Download** của UI, chạy đúng lệnh GitHub hiển thị để tải archive theo kiến trúc, kiểm tra checksum và giải nén. Thực hiện các lệnh này với tài khoản `gha-runner` trong `/opt/actions-runner`.
2. Trong phần **Configure**, lấy registration token do UI sinh. Token này chỉ dùng để đăng ký runner và hết hạn sau **một giờ**; nó không phải PAT và không nên lưu vào repository, image hoặc script bootstrap lâu dài.
3. Chạy lệnh `config.sh` từ UI. Ví dụ dưới đây tránh ghi token trực tiếp vào shell history và thêm hai custom label:

```bash
cd /opt/actions-runner

export RUNNER_URL='https://github.com/OWNER/REPOSITORY'
read -rsp 'Registration token từ GitHub UI: ' RUNNER_TOKEN
echo

./config.sh \
  --url "$RUNNER_URL" \
  --token "$RUNNER_TOKEN" \
  --name 'build-linux-x64-01' \
  --labels 'build,linux-x64' \
  --work '_work'

unset RUNNER_TOKEN
```

Thay `RUNNER_URL` bằng URL repository, organization hoặc enterprise tương ứng. Không thay giá trị mẫu bằng token thật trong file tài liệu hay workflow. Nếu token hết hạn, quay lại UI để sinh token mới; không tái sử dụng PAT làm registration token.

`config.sh` sẽ hỏi thêm nếu bạn bỏ các tham số tùy chọn. Tên runner nên duy nhất và mô tả được pool, hệ điều hành hoặc vị trí. Custom label nên mô tả **năng lực có thật**, chẳng hạn `gpu`, `arm64-build` hoặc `prod-deploy`.

<Callout type="warn" title="Token ngắn hạn không giải quyết mọi rủi ro">
  Token đăng ký hết hạn nhanh, nhưng máy sau khi đăng ký vẫn có thể nhận job cho đến khi bị gỡ hoặc mất quyền. Bảo vệ thư mục runner, file cấu hình ẩn và tài khoản service như tài sản production.
</Callout>

### Kiểm tra ở chế độ tương tác

Trước khi tạo service, chạy runner ở foreground để kiểm tra DNS, TLS và đăng ký:

```bash
cd /opt/actions-runner
./run.sh
```

Khi thành công, terminal hiển thị trạng thái đã kết nối và đang lắng nghe job. Trên GitHub, runner chuyển sang **Idle**. Nhấn `Ctrl+C` để dừng foreground trước khi cài service.

Ba trạng thái chính trong UI là:

- **Idle:** đã kết nối và sẵn sàng nhận job.
- **Active:** đang thực thi một job.
- **Offline:** ứng dụng runner không chạy, máy tắt hoặc không kết nối được GitHub.

### Chạy runner như một service

Trên Linux dùng `systemd`, script `svc.sh` được tạo sau khi đăng ký. Từ thư mục runner, cài service dưới tài khoản chuyên dụng rồi khởi động:

```bash
cd /opt/actions-runner
sudo ./svc.sh install gha-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

Service tự khởi động lại cùng máy. Không chạy thêm `./run.sh` khi service đang hoạt động, vì hai listener không nên dùng chung một cấu hình runner.

Để xem đúng tên unit và theo dõi log realtime:

```bash
cd /opt/actions-runner
SERVICE_NAME="$(cat .service)"
sudo journalctl -u "$SERVICE_NAME" -f
```

Log chẩn đoán của ứng dụng và worker cũng nằm trong `/opt/actions-runner/_diag`. File bắt đầu bằng `Runner_` ghi hoạt động listener; file bắt đầu bằng `Worker_` ghi chi tiết job.

## Định tuyến bằng labels

Khi đăng ký bình thường, self-hosted runner tự nhận các default label:

- `self-hosted`;
- hệ điều hành: `linux`, `windows` hoặc `macOS`;
- kiến trúc: `x64`, `ARM` hoặc `ARM64` tùy máy.

Một job chỉ được route đến runner khớp **tất cả** label trong `runs-on`. Ví dụ sau yêu cầu runner self-hosted Linux x64 có custom label `build`:

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, x64, build]
    steps:
      - run: uname -a
```

Labels không phải cơ chế xác thực năng lực. Nếu gắn nhầm `gpu` cho máy không có GPU, GitHub vẫn route job tới đó. Hãy quản lý label bằng image/configuration automation và kiểm tra năng lực trong health check.

Có thể gắn nhiều label khi đăng ký bằng `--labels 'build,linux-x64'`. Với runner đã đăng ký, thêm hoặc gỡ label trong **Settings → Actions → Runners → tên runner → Labels**, hoặc dùng REST API. Labels không phân biệt chữ hoa chữ thường.

Runner group và label giải quyết hai bài toán khác nhau:

- **Group** giới hạn repository hoặc workflow nào được phép dùng pool.
- **Label** chọn runner có năng lực phù hợp bên trong phạm vi được phép.

Với group và label kết hợp, runner phải đồng thời thuộc group được chỉ định và khớp label. Xem phần [Labels và runner groups](/docs/runners/03-labels-va-runner-groups) để thiết kế routing chi tiết.

## Vòng đời job và runner

### Job được xếp hàng và thực thi

Luồng thực thi cơ bản như sau:

```text
Workflow event
      │
      ▼
Job ở trạng thái queued
      │  GitHub tìm group + toàn bộ labels
      ▼
Runner online và idle được gán job
      │
      ▼
Runner tải action/mã cần thiết và chạy từng step
      │
      ▼
Post-job cleanup → gửi log/kết quả → completed
      │
      ├── Persistent: trở lại Idle
      └── Ephemeral: tự gỡ đăng ký, hạ tầng phải bị hủy
```

Nếu runner được gán không nhận job trong 60 giây, GitHub đưa job trở lại hàng đợi để runner phù hợp khác có thể nhận. Nếu không có runner online và idle khớp điều kiện, job tiếp tục chờ. Job thất bại nếu nằm trong hàng đợi quá 24 giờ.

Trong lúc chạy, runner chuyển sang **Active** và không còn là ứng viên idle cho job khác. Muốn chạy song song nhiều job, cần nhiều runner registration/process; chỉ tăng số core của một runner không tự tạo thêm concurrency.

### Persistent runner

Persistent runner tiếp tục tồn tại và nhận nhiều job nối tiếp nhau. Mô hình này đơn giản cho lab hoặc workload hoàn toàn tin cậy, nhưng không đảm bảo môi trường sạch giữa các job.

Ví dụ, job A có thể để lại file trong `_work`, cài package toàn hệ thống hoặc khởi động daemon. Job B sau đó có thể đọc hoặc bị ảnh hưởng bởi trạng thái đó. Post-job cleanup của action không thay thế việc dựng một máy mới.

Nếu phải dùng persistent runner:

- chỉ nhận workload cùng trust boundary;
- không lưu khóa SSH, cloud credential hoặc secret lâu dài trên máy;
- giám sát disk, process còn sót và thay mới máy định kỳ;
- dừng nhận job mới trước khi bảo trì và chỉ thao tác khi runner đang **Idle**.

### Ephemeral runner

Ephemeral runner đăng ký với `--ephemeral` và GitHub tự gỡ đăng ký sau khi runner xử lý một job:

```bash
./config.sh \
  --url 'https://github.com/OWNER/REPOSITORY' \
  --token "$RUNNER_TOKEN" \
  --ephemeral \
  --name 'ephemeral-linux-x64' \
  --labels 'build,ephemeral'
```

Sau job, automation của bạn phải hủy VM/container và storage đi kèm. Chỉ gỡ registration mà tái sử dụng nguyên máy không tạo ra môi trường sạch.

GitHub khuyến nghị ephemeral runner cho autoscaling; autoscaling persistent runner không được khuyến nghị. Với Kubernetes, Actions Runner Controller là giải pháp tham chiếu được GitHub khuyến nghị. Nếu tự xây autoscaler, có thể dùng scale set client hoặc sự kiện `workflow_job`, nhưng phải xử lý idempotency, burst capacity, timeout và việc hủy máy lỗi.

<Callout type="warn" title="Đưa log ephemeral ra bên ngoài">
  Máy bị hủy sẽ làm mất `_diag`. Trước khi dùng ephemeral runner trong production, chuyển Runner/Worker log sang hệ thống lưu trữ tập trung và giữ correlation với workflow run.
</Callout>

Just-in-time runner là biến thể ephemeral được tạo qua REST API với cấu hình mã hóa và chạy tối đa một job. Đây là lựa chọn tốt cho hệ thống cấp phát tự động; đừng nhúng registration token dài hạn vào image.

## Cập nhật runner

Mặc định, ứng dụng self-hosted runner tự cập nhật khi có phiên bản mới. Runner có thể cập nhật khi được gán job hoặc trong vòng một tuần kể từ release nếu chưa nhận job. Cơ chế này chỉ cập nhật ứng dụng runner, không cập nhật Linux, Docker, SDK hay các action trong workflow.

Có thể tắt tự cập nhật khi đăng ký bằng `--disableupdate`:

```bash
./config.sh \
  --url 'https://github.com/OWNER/REPOSITORY' \
  --token "$RUNNER_TOKEN" \
  --disableupdate
```

Chỉ dùng tùy chọn này khi có pipeline build image và rollout runner version chủ động. GitHub yêu cầu runner tắt tự cập nhật phải được nâng cấp trong vòng 30 ngày kể từ khi phiên bản mới xuất hiện. Sau thời hạn đó, GitHub không xếp job cho runner. Bản vá bảo mật nghiêm trọng có thể khiến runner bị chặn sớm hơn cho đến khi cập nhật.

Quy trình production nên là:

1. Theo dõi release của [`actions/runner`](https://github.com/actions/runner/releases).
2. Build image mới từ nguồn tin cậy và kiểm tra checksum theo hướng dẫn release.
3. Tạo canary runner với custom label riêng rồi chạy workflow kiểm thử.
4. Xác nhận runner cũ **Idle**, dừng service và thay dần theo pool.
5. Kiểm tra log `_diag`, trạng thái queue và thời gian khởi tạo sau rollout.

Với ephemeral container, bake phiên bản runner vào image và tạo lại image thường dễ kiểm soát hơn việc để mỗi container tải bản cập nhật khi khởi động.

## Mạng và proxy

### Kết nối bắt buộc

Runner chủ động kết nối ra ngoài bằng HTTPS qua cổng `443`; không cần inbound connection từ GitHub. Tài liệu GitHub hiện nêu băng thông tối thiểu 70 kbit/s theo cả hai chiều cho ứng dụng runner, nhưng workload thực tế cần nhiều hơn khi tải source, container image hoặc artifact.

Các domain cốt lõi gồm:

```text
github.com
api.github.com
*.actions.githubusercontent.com
```

Workflow thường còn cần:

- `codeload.github.com` để tải action;
- `results-receiver.actions.githubusercontent.com` và `*.blob.core.windows.net` cho log, summary, cache và artifact;
- các endpoint release/object để cập nhật runner;
- `ghcr.io`, `*.pkg.github.com` và endpoint package tương ứng nếu dùng GitHub Packages;
- endpoint của cloud, package registry và dịch vụ nội bộ mà chính workflow gọi.

Danh sách domain có thể thay đổi và một số tên dùng CNAME. Dùng [danh sách chính thức theo chức năng](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#accessible-domains-by-function) làm nguồn cấu hình firewall. Nếu organization hoặc enterprise bật IP allow list, thêm địa chỉ egress của runner theo chính sách tương ứng.

Không cấp egress toàn mạng nội bộ chỉ để “pipeline dễ chạy”. Ví dụ, pool build chỉ cần source và package registry không nên truy cập subnet production database.

### Cấu hình proxy

Runner đọc `https_proxy`, `http_proxy` và `no_proxy` khi khởi động. Trên Linux/macOS, dùng tên biến chữ thường và đặt chúng **trước** khi chạy `config.sh` hoặc service:

```bash
export https_proxy='http://proxy.internal.example:8080'
export http_proxy='http://proxy.internal.example:8080'
export no_proxy='localhost,127.0.0.1,registry.internal.example'

./config.sh --url "$RUNNER_URL" --token "$RUNNER_TOKEN"
```

Với service account, có thể đặt cấu hình trong file `.env` ở thư mục runner:

```dotenv
https_proxy=http://proxy.internal.example:8080
http_proxy=http://proxy.internal.example:8080
no_proxy=localhost,127.0.0.1,registry.internal.example
```

Khởi động lại runner sau khi đổi proxy. Không commit `.env` nếu URL chứa credential. Ưu tiên proxy authentication qua secret store hoặc cấu hình hệ thống thay vì ghi `user:password` dạng rõ.

Container action và service container có thể cần cấu hình proxy riêng cho Docker daemon/client. Proxy của runner không tự bảo đảm container truy cập mạng được.

<Callout type="error" title="Không tắt TLS verification trong production">
  Nếu proxy giải mã TLS, hãy cài CA của tổ chức vào trust store hệ điều hành. Tắt kiểm tra chứng chỉ chỉ che giấu lỗi cấu hình và làm mất tính toàn vẹn của kết nối đến GitHub.
</Callout>

## Bài thực hành với workflow

Bài thực hành giả định runner Linux x64 đã đăng ký ở repository private với custom label `build` và đang ở trạng thái **Idle**. Workflow chỉ dùng shell có sẵn, không cần checkout source hay secret.

### Tạo workflow

Tạo file `.github/workflows/verify-self-hosted.yml` trong repository đã được runner phục vụ:

```yaml
name: Verify self-hosted runner

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  inspect-runner:
    name: Inspect runner environment
    runs-on: [self-hosted, linux, x64, build]
    timeout-minutes: 10

    steps:
      - name: Show runner identity
        shell: bash
        run: |
          set -euo pipefail
          printf 'name=%s\n' "$RUNNER_NAME"
          printf 'os=%s\n' "$RUNNER_OS"
          printf 'arch=%s\n' "$RUNNER_ARCH"
          uname -a

      - name: Verify temporary storage
        shell: bash
        run: |
          set -euo pipefail
          test -d "$RUNNER_TEMP"
          printf 'self-hosted-ok\n' > "$RUNNER_TEMP/runner-check.txt"
          test "$(cat "$RUNNER_TEMP/runner-check.txt")" = 'self-hosted-ok'
          printf 'Temporary storage is writable\n'
```

`workflow_dispatch` yêu cầu người có quyền chủ động chạy workflow, phù hợp hơn trigger PR cho bài kiểm tra self-hosted runner. `permissions: contents: read` giảm quyền mặc định của `GITHUB_TOKEN`. Danh sách `runs-on` buộc cả bốn label cùng khớp.

### Chạy và kiểm chứng

1. Mở tab **Actions**, chọn **Verify self-hosted runner**, rồi chọn **Run workflow**.
2. Quan sát runner chuyển từ **Idle** sang **Active**.
3. Mở job log và kiểm tra `RUNNER_NAME`, `RUNNER_OS`, `RUNNER_ARCH` đúng với máy đã đăng ký.
4. Xác nhận hai step thành công và job kết thúc màu xanh.
5. Với persistent runner, xác nhận runner trở lại **Idle**. Với ephemeral runner, xác nhận registration biến mất và máy/container đã bị automation hủy.

Nếu job cứ ở **Queued**, so sánh từng label trong `runs-on`, runner group access và trạng thái online. GitHub không tự bỏ qua label không khớp để chọn một runner gần đúng.

## Gỡ đăng ký an toàn

Gỡ registration trước khi xóa thư mục hoặc tái sử dụng máy. Quy trình cho Linux service là:

1. Đảm bảo runner đang **Idle** và không còn job cần chạy.
2. Dừng và gỡ service:

```bash
cd /opt/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh uninstall
```

3. Trên GitHub, vào **Settings → Actions → Runners → tên runner → Remove**.
4. UI sinh removal token có thời hạn và lệnh phù hợp. Chạy đúng lệnh được hiển thị dưới tài khoản sở hữu thư mục. Dạng lệnh Linux là:

```bash
./config.sh remove --token 'REMOVAL_TOKEN_FROM_UI'
```

5. Chỉ sau khi lệnh thành công mới xóa thư mục, disk hoặc VM. Xóa luôn credential, cache và log theo retention policy.

Nếu mất quyền truy cập máy, chọn **Force remove this runner** trong UI rồi thu hồi hoặc hủy máy bằng hệ thống hạ tầng. Đừng force-remove và tiếp tục dùng nguyên máy như một runner mới mà không kiểm tra compromise.

GitHub tự xóa persistent runner không kết nối quá 14 ngày. Ephemeral runner offline quá một ngày cũng tự bị xóa. Đây là cơ chế dọn registration cũ, không phải chiến lược decommission; dữ liệu trên máy vẫn do bạn xử lý.

## Best practices

- **Chỉ nhận mã tin cậy:** không dùng persistent self-hosted runner cho public repository hoặc PR từ fork. Nếu bắt buộc xử lý mã không tin cậy, dùng máy dùng một lần, không secret, egress tối thiểu và không đường mạng đến production.
- **Tách trust boundary:** tạo pool/group riêng cho build, deployment, production và workload đặc quyền. Chỉ chia sẻ runner giữa các repository có cùng chủ sở hữu rủi ro.
- **Ưu tiên ephemeral cho autoscaling:** tạo máy sạch cho mỗi job, tự gỡ sau một job, chuyển log ra ngoài rồi hủy toàn bộ storage.
- **Không chạy bằng `root`:** dùng service account riêng. Quyền `sudo`, Docker socket hoặc cloud instance role đều tương đương quyền đặc quyền và phải được xem xét rõ ràng.
- **Giảm quyền workflow:** khai báo `permissions` tối thiểu, dùng environment approval cho deployment và dùng OIDC để lấy cloud credential ngắn hạn thay vì secret tĩnh.
- **Bảo vệ workflow:** yêu cầu review/CODEOWNERS cho `.github/workflows`, kiểm tra action bên thứ ba và pin action production vào full commit SHA khi phù hợp.
- **Quản lý bằng image và code:** version hóa cấu hình máy, label, firewall và toolchain. Không sửa tay một fleet rồi hy vọng các runner giống nhau.
- **Giới hạn mạng:** allowlist endpoint cần thiết, tách subnet, chặn metadata/service nhạy cảm và không đặt khóa dài hạn trên filesystem.
- **Theo dõi sức khỏe:** cảnh báo Offline, queue time, disk usage, CPU/RAM, lỗi update và service restart. Tập trung `_diag` log, đặc biệt với ephemeral runner.
- **Lập kế hoạch dung lượng:** một runner đang Active không nhận job như một runner idle. Dùng nhiều runner hoặc autoscaling để đạt concurrency mong muốn.
- **Thay mới thay vì làm sạch thủ công:** cleanup script dễ bỏ sót process, mount, cache hoặc credential. Immutable image và teardown toàn máy cho ranh giới rõ hơn.
- **Kiểm thử decommission:** diễn tập stop, remove, rotate credential và rebuild runner để quy trình sự cố không phụ thuộc kiến thức của một người.

## Troubleshooting

| Triệu chứng | Kiểm tra gần nhất | Hướng xử lý |
|---|---|---|
| Runner hiển thị **Offline** | Máy, tiến trình service, DNS, proxy và outbound `443` | Chạy `sudo ./svc.sh status`; xem `journalctl` và file `Runner_` trong `_diag`; khởi động service sau khi sửa kết nối |
| Job nằm **Queued** dù có runner | Tất cả label trong `runs-on`, group access, trạng thái **Idle** và concurrency | Sửa label/group; thêm runner cùng pool nếu tất cả runner đang **Active**; nhớ rằng job có thể chờ đến 24 giờ |
| `config.sh` báo token không hợp lệ | Registration token đã quá một giờ, sai scope URL hoặc bị copy thiếu | Sinh token mới từ đúng trang repository/organization/enterprise rồi chạy lại; không dùng PAT thay thế |
| Service cài được nhưng chạy sai user | Tên user khi `svc.sh install`, ownership của `/opt/actions-runner` và quyền `_work` | Gỡ service, sửa owner/quyền tối thiểu và cài lại dưới service account chuyên dụng |
| Proxy chạy trong shell nhưng service không kết nối | Service không kế thừa biến shell hoặc runner chưa được restart | Đặt biến chữ thường trong `.env` của thư mục runner hoặc cấu hình hệ thống, bảo vệ credential rồi restart service |
| Lỗi TLS hoặc certificate | CA trust store, TLS inspection, thời gian hệ thống | Cài CA hợp lệ và đồng bộ thời gian; không duy trì `GITHUB_ACTIONS_RUNNER_TLS_NO_VERIFY=1` |
| Container action báo không tìm thấy Docker | Runner không phải Linux, Docker chưa cài/chưa chạy | Dùng Linux runner; cài Docker theo tài liệu vendor và kiểm tra `sudo systemctl is-active docker.service` |
| Docker báo `permission denied` với socket | Service account không có quyền truy cập Docker socket | Xác định user của systemd unit và cấp quyền theo mô hình bảo mật đã duyệt; hiểu rằng quyền Docker thường tương đương root |
| Job sau bị ảnh hưởng bởi job trước | Persistent workspace, process hoặc package còn sót | Thay runner bằng image sạch; tách workload; ưu tiên ephemeral thay vì mở rộng cleanup script |
| Runner ngừng nhận job sau khi tắt update | Phiên bản cũ quá ngưỡng hoặc có security update bắt buộc | Cập nhật từ release chính thức, kiểm tra checksum, rollout canary rồi thay pool |
| Disk đầy | `_work`, `_diag`, tool cache, Docker image/layer hoặc artifact tạm | Dừng khi **Idle**, xác định nguồn tăng trưởng, áp dụng retention và thay mới máy; không xóa file của job đang chạy |

Để kiểm tra các endpoint GitHub từ chính ứng dụng runner, `config.sh --check` yêu cầu URL cùng một PAT chẩn đoán có quyền workflow phù hợp. Không ghi PAT vào history hoặc tài liệu:

```bash
cd /opt/actions-runner
read -rsp 'Diagnostic PAT tạm thời: ' DIAGNOSTIC_PAT
echo
./config.sh --check --url "$RUNNER_URL" --pat "$DIAGNOSTIC_PAT"
unset DIAGNOSTIC_PAT
```

Kết quả ghi `PASS` hoặc `FAIL` cho từng dịch vụ; log chi tiết nằm trong `_diag`. Thu hồi PAT chẩn đoán sau khi dùng.

## Tài liệu tham khảo

- [Self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners)
- [Self-hosted runners reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [Adding self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
- [Using self-hosted runners in a workflow](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)
- [Configuring the runner application as a service](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application)
- [Using labels with self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/apply-labels)
- [Managing access with runner groups](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
- [Using proxy servers with a runner](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/using-a-proxy-server-with-self-hosted-runners)
- [Monitoring and troubleshooting self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/monitor-and-troubleshoot)
- [Removing self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/remove-runners)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners)
- [`actions/runner` releases](https://github.com/actions/runner/releases)

## Đọc tiếp

<Cards>
  <Card title="GitHub-hosted runners" href="/docs/runners/01-github-hosted-runners" description="So sánh lựa chọn được GitHub quản lý và image có sẵn." />
  <Card title="Labels và runner groups" href="/docs/runners/03-labels-va-runner-groups" description="Thiết kế quyền truy cập và định tuyến job theo năng lực." />
  <Card title="Autoscaling với ARC" href="/docs/runners/05-autoscaling-arc" description="Tự động cấp phát ephemeral runner trên Kubernetes." />
  <Card title="Bảo mật runner" href="/docs/runners/06-runner-hardening" description="Hardening execution environment và giảm blast radius." />
  <Card title="Giám sát và bảo trì" href="/docs/runners/07-runner-monitoring-maintenance" description="Theo dõi sức khỏe, cập nhật và xử lý sự cố runner." />
</Cards>
