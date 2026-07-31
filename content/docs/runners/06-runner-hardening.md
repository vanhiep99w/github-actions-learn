---
title: "Bảo mật runner"
description: "Thiết kế trust boundary, cô lập và vận hành GitHub Actions runner để giảm khả năng chiếm quyền và giới hạn blast radius."
---

<Callout type="error" title="Nguyên tắc không được phá vỡ">
  Không chạy mã không tin cậy trên self-hosted runner dùng lâu dài. Repository private cũng có thể nhận mã độc từ người có quyền fork hoặc tạo pull request. Ưu tiên GitHub-hosted runner. Nếu bắt buộc tự quản lý hạ tầng, hãy cấp một môi trường sạch cho đúng một job rồi hủy toàn bộ môi trường đó.
</Callout>

Hardening runner không chỉ là cài bản vá cho hệ điều hành. Bạn phải kiểm soát mã nào được chạy, runner nhìn thấy tài sản nào và credential nào xuất hiện trong từng job. Mục tiêu thực tế là ngăn một job xâm nhập job khác và giới hạn hậu quả nếu một step bị chiếm quyền.

## Mục lục

- [Phạm vi và kết quả](#phạm-vi-và-kết-quả)
- [Mô hình đe dọa runner](#mô-hình-đe-dọa-runner)
  - [Tài sản và hậu quả](#tài-sản-và-hậu-quả)
  - [Đối thủ và điểm vào](#đối-thủ-và-điểm-vào)
  - [Ranh giới tin cậy](#ranh-giới-tin-cậy)
- [Chọn mô hình runner theo mức độ tin cậy](#chọn-mô-hình-runner-theo-mức-độ-tin-cậy)
  - [GitHub-hosted là lựa chọn mặc định](#github-hosted-là-lựa-chọn-mặc-định)
  - [Self-hosted ephemeral khi cần kiểm soát hạ tầng](#self-hosted-ephemeral-khi-cần-kiểm-soát-hạ-tầng)
  - [Persistent chỉ cho mã tin cậy](#persistent-chỉ-cho-mã-tin-cậy)
- [Xử lý mã không tin cậy và pull request từ fork](#xử-lý-mã-không-tin-cậy-và-pull-request-từ-fork)
  - [Phê duyệt không biến mã thành tin cậy](#phê-duyệt-không-biến-mã-thành-tin-cậy)
  - [Không checkout mã PR trong ngữ cảnh đặc quyền](#không-checkout-mã-pr-trong-ngữ-cảnh-đặc-quyền)
  - [Tách PR và tác vụ đặc quyền](#tách-pr-và-tác-vụ-đặc-quyền)
- [Cô lập self-hosted runner](#cô-lập-self-hosted-runner)
  - [Hệ điều hành và máy thực thi](#hệ-điều-hành-và-máy-thực-thi)
  - [Docker socket và quyền root](#docker-socket-và-quyền-root)
  - [Kiểm soát mạng ra ngoài](#kiểm-soát-mạng-ra-ngoài)
  - [Cloud IAM và metadata service](#cloud-iam-và-metadata-service)
- [Giới hạn quyền truy cập runner](#giới-hạn-quyền-truy-cập-runner)
  - [Runner groups là boundary truy cập](#runner-groups-là-boundary-truy-cập)
  - [Labels chỉ dùng để định tuyến](#labels-chỉ-dùng-để-định-tuyến)
- [Bảo vệ token secret và OIDC](#bảo-vệ-token-secret-và-oidc)
  - [Giảm quyền token của workflow](#giảm-quyền-token-của-workflow)
  - [Giảm vòng đời và phạm vi secret](#giảm-vòng-đời-và-phạm-vi-secret)
  - [Dùng OIDC cho cloud](#dùng-oidc-cho-cloud)
- [Bảo vệ chuỗi cung ứng workflow](#bảo-vệ-chuỗi-cung-ứng-workflow)
  - [Pin action bằng full commit SHA](#pin-action-bằng-full-commit-sha)
  - [Chặn script injection](#chặn-script-injection)
  - [Bảo vệ workflow cache và artifact](#bảo-vệ-workflow-cache-và-artifact)
- [Vòng đời image cleanup và logging](#vòng-đời-image-cleanup-và-logging)
  - [Golden image và patching](#golden-image-và-patching)
  - [Cleanup và credential persistence](#cleanup-và-credential-persistence)
  - [Logging không làm lộ secret](#logging-không-làm-lộ-secret)
- [Bài thực hành workflow an toàn](#bài-thực-hành-workflow-an-toàn)
  - [Kịch bản](#kịch-bản)
  - [Workflow mẫu](#workflow-mẫu)
  - [Cách kiểm chứng](#cách-kiểm-chứng)
- [Checklist hardening](#checklist-hardening)
  - [Quyết định kiến trúc](#quyết-định-kiến-trúc)
  - [Quyền truy cập](#quyền-truy-cập)
  - [Hệ điều hành và container](#hệ-điều-hành-và-container)
  - [Mạng và cloud](#mạng-và-cloud)
  - [Token và secret](#token-và-secret)
  - [Chuỗi cung ứng](#chuỗi-cung-ứng)
  - [Vận hành](#vận-hành)
- [Ứng phó sự cố runner](#ứng-phó-sự-cố-runner)
  - [Dấu hiệu cần coi là compromise](#dấu-hiệu-cần-coi-là-compromise)
  - [Quy trình cô lập và khôi phục](#quy-trình-cô-lập-và-khôi-phục)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)
- [Đọc tiếp](#đọc-tiếp)

## Phạm vi và kết quả

Tài liệu này áp dụng cho GitHub-hosted runner, larger runner và self-hosted runner. Trọng tâm là execution plane, tức nơi workflow thực sự chạy lệnh và nhận credential.

Sau khi hoàn thành, bạn có thể:

- phân loại workflow theo mức độ tin cậy của mã;
- chọn GitHub-hosted hoặc self-hosted runner phù hợp;
- tách runner theo repository, workflow và môi trường;
- giảm quyền hệ điều hành, mạng, cloud IAM và `GITHUB_TOKEN`;
- bảo vệ secret, OIDC, action, cache và artifact;
- xây image, cleanup, logging và quy trình ứng phó sự cố.

Hardening không làm mã độc trở thành an toàn. Hardening tạo nhiều lớp kiểm soát để mã độc khó thoát khỏi job và khó tiếp cận tài sản có giá trị.

## Mô hình đe dọa runner

Một workflow là chương trình có khả năng chạy lệnh tùy ý. Action bên thứ ba, dependency build script và test của pull request đều là mã thực thi. Hãy threat-model toàn bộ job thay vì chỉ xem các dòng `run:`.

### Tài sản và hậu quả

Runner có thể tiếp cận nhiều tài sản hơn phần YAML thể hiện:

| Tài sản | Ví dụ | Hậu quả khi bị lấy hoặc sửa |
|---|---|---|
| Credential GitHub | `GITHUB_TOKEN`, GitHub App token, deploy key | Sửa source, release, issue, package hoặc workflow |
| Cloud credential | OIDC access token, instance role, service account | Đọc dữ liệu, sửa hạ tầng hoặc triển khai mã độc |
| Secret ứng dụng | API key, signing key, registry password | Giả mạo release hoặc truy cập dịch vụ production |
| Trạng thái máy | workspace, `$HOME`, process, socket, cache | Bám trụ và tấn công job tiếp theo |
| Mạng nội bộ | database, registry, control plane, metadata endpoint | Di chuyển ngang trong hạ tầng |
| Artifact và cache | binary, package, dependency cache | Đầu độc chuỗi cung ứng |
| Log và telemetry | command line, environment, diagnostic bundle | Làm lộ secret hoặc thông tin kiến trúc |

Blast radius là phạm vi hậu quả sau khi một runner bị chiếm quyền. Một runner có quyền deploy toàn enterprise tạo blast radius lớn hơn một runner chỉ đọc source của một repository.

### Đối thủ và điểm vào

Không chỉ người mở pull request mới là nguồn đe dọa. Các điểm vào phổ biến gồm:

- mã trong pull request từ fork;
- contributor nội bộ có tài khoản bị chiếm;
- action hoặc reusable workflow bên thứ ba bị cài backdoor;
- dependency chạy lifecycle script trong lúc cài đặt;
- dữ liệu sự kiện được chèn trực tiếp vào shell;
- container image hoặc toolchain bị thay thế;
- cache hoặc artifact do job ít tin cậy tạo ra;
- credential tồn tại sẵn trên persistent runner;
- lỗi kernel, container runtime hoặc runner application chưa được vá.

Ví dụ, `npm ci` có thể chạy script do package định nghĩa. Job vẫn thực thi mã không tin cậy dù workflow không có dòng `npm test`.

### Ranh giới tin cậy

Phân loại workload trước khi chọn runner:

| Mức | Ví dụ | Secret và quyền | Runner phù hợp |
|---|---|---|---|
| Không tin cậy | PR từ fork, code từ repository công khai, fuzzing input lạ | Không secret; token chỉ đọc tối thiểu; không cloud identity | GitHub-hosted sạch theo job; hoặc self-hosted VM/JIT dùng một lần và cô lập mạnh nếu bắt buộc |
| Tin cậy có điều kiện | Push từ branch được bảo vệ, PR nội bộ đã review | Chỉ quyền cần cho build; không quyền production | GitHub-hosted hoặc ephemeral self-hosted pool riêng |
| Đặc quyền | Ký artifact, publish package, deploy production | OIDC ngắn hạn; environment approval; quyền theo job | Pool riêng; chỉ workflow được allowlist; không nhận PR |
| Quản trị runner | Build golden image, đăng ký runner, autoscaler | Quyền quản lý runner và hạ tầng | Control plane riêng; không dùng làm runner cho repository |

<Callout type="warn" title="Private không đồng nghĩa với trusted">
  Người có quyền đọc một private repository thường có thể fork và mở pull request theo policy của tổ chức. Một tài khoản nội bộ bị chiếm cũng có thể sửa mã. Hãy phân loại theo đường đi của mã và quyền của actor, không theo nhãn `private`.
</Callout>

## Chọn mô hình runner theo mức độ tin cậy

### GitHub-hosted là lựa chọn mặc định

GitHub-hosted runner tiêu chuẩn chạy mỗi job trên một máy ảo mới. GitHub quản lý image, cấp phát máy và hủy máy sau job. Mô hình này loại bỏ phần lớn khả năng bám trụ sang job kế tiếp.

GitHub-hosted không bảo vệ credential mà bạn chủ động đưa vào job. Mã độc vẫn có thể gửi `GITHUB_TOKEN`, OIDC token hoặc secret ra ngoài trong thời gian job chạy. Vì vậy, isolation phải đi cùng least privilege.

Ưu tiên GitHub-hosted khi:

- workflow chạy được trên image chuẩn;
- mã đến từ pull request hoặc nguồn khó tin cậy;
- không cần truy cập trực tiếp mạng nội bộ;
- đội ngũ chưa có nền tảng cấp phát và hủy runner tự động;
- yêu cầu quan trọng nhất là một máy sạch cho mỗi job.

Có thể kiểm tra SBOM của image GitHub-hosted tại release tương ứng trong repository [`actions/runner-images`](https://github.com/actions/runner-images/releases). SBOM là danh mục thành phần phần mềm. Nó hỗ trợ đánh giá lỗ hổng nhưng không thay thế việc giới hạn quyền job.

### Self-hosted ephemeral khi cần kiểm soát hạ tầng

Dùng self-hosted runner khi có yêu cầu như GPU, thiết bị vật lý, toolchain độc quyền hoặc mạng riêng. Với autoscaling, GitHub khuyến nghị ephemeral self-hosted runner. GitHub không khuyến nghị autoscaling persistent runner.

Một thiết kế đúng cần thỏa cả ba điều kiện:

1. Runner chỉ nhận tối đa một job bằng ephemeral registration hoặc just-in-time runner.
2. VM hoặc compute sandbox bắt đầu từ image sạch.
3. Toàn bộ VM, disk ghi được và credential tạm bị hủy sau job.

Chỉ gỡ registration không làm máy sạch. Khởi động container runner mới trên cùng host cũng không xóa process, mount, Docker layer hoặc dữ liệu mà job trước để lại trên host.

<Callout type="warn" title="Ephemeral là thuộc tính của cả hạ tầng">
  Cờ `--ephemeral` bảo đảm registration tự gỡ sau một job. Cờ này không tự xóa VM hoặc storage. Automation phải hủy tài nguyên ngay cả khi job timeout, runner crash hoặc bước post-job không chạy.
</Callout>

Ưu tiên VM hoặc sandbox có boundary mạnh cho mã không tin cậy. Container chia sẻ kernel với host nên không tương đương một VM mới. Nếu dùng Kubernetes, hãy đánh giá quyền của pod, node, service account, volume, network policy và container runtime như một phần của cùng threat model.

### Persistent chỉ cho mã tin cậy

Persistent self-hosted runner nhận nhiều job nối tiếp nhau. Job trước có thể để lại file, process, cron, service, credential helper hoặc thay đổi toolchain. Cleanup script khó chứng minh đã loại bỏ mọi dấu vết.

Chỉ dùng persistent runner khi mọi workload thuộc cùng một trust boundary. Pool đó không được nhận PR từ fork hoặc workflow do contributor không tin cậy kiểm soát. Runner ký artifact và runner deploy production cũng không nên dùng chung với runner build thông thường.

Nếu một persistent runner từng chạy mã đáng ngờ, hãy coi máy đã bị compromise. Cách khôi phục là cô lập và dựng lại từ golden image. Không tiếp tục dùng máy chỉ vì antivirus không phát hiện gì.

## Xử lý mã không tin cậy và pull request từ fork

Workflow `pull_request` từ public fork không nhận repository secrets. `GITHUB_TOKEN` của trường hợp này có quyền chỉ đọc. Tuy nhiên, những mặc định đó không phải sandbox cho self-hosted runner và có thể khác theo policy của private fork.

Nguyên tắc an toàn là không cấp secret, OIDC và đường mạng nhạy cảm cho job chạy code PR. Job đó nên chạy trên GitHub-hosted runner hoặc một self-hosted sandbox dùng một lần.

### Phê duyệt không biến mã thành tin cậy

GitHub có thể yêu cầu maintainer phê duyệt workflow run từ contributor bên ngoài. Người phê duyệt phải xem toàn bộ thay đổi trước khi chọn **Approve workflows to run**. Cần chú ý đặc biệt tới `.github/workflows`, local action, build script, lockfile và test fixture.

Phê duyệt chỉ là cổng kiểm soát con người. Sau khi được chạy, code vẫn có thể độc hại. Vì vậy, workflow được phê duyệt vẫn không được chạy trên persistent self-hosted runner có quyền nội bộ.

### Không checkout mã PR trong ngữ cảnh đặc quyền

`pull_request_target` chạy workflow từ default branch trong ngữ cảnh của base repository. Event này phù hợp cho thao tác như gắn label hoặc bình luận. Event này không phù hợp để build hay chạy code của PR.

Không thực hiện các hành vi sau trong workflow `pull_request_target`:

```yaml
# Không dùng mẫu này.
on: pull_request_target

jobs:
  unsafe:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: ./scripts/from-the-pr.sh
```

Mẫu trên đưa mã PR vào một workflow có thể có write token, secret và cache đặc quyền. Kẻ tấn công có thể lấy credential hoặc đầu độc cache. Rủi ro tương tự tồn tại khi `workflow_run` tải artifact không tin cậy rồi thực thi nội dung của artifact.

Nói ngắn gọn: workflow đặc quyền không checkout, import, `eval` hoặc chạy nội dung do PR kiểm soát.

### Tách PR và tác vụ đặc quyền

Dùng hai trust zone thay vì cố gắng làm một job vừa chạy code lạ vừa có quyền ghi:

```text
PR từ fork
    │
    ▼
Zone A: kiểm thử không đặc quyền
- GitHub-hosted hoặc VM dùng một lần
- không secret, không OIDC
- GITHUB_TOKEN chỉ đọc
- artifact được coi là không tin cậy
    │
    ▼ chỉ truyền kết quả tối thiểu đã kiểm tra
Maintainer review + merge vào branch được bảo vệ
    │
    ▼
Zone B: build/publish/deploy đặc quyền
- workflow từ branch được bảo vệ
- environment approval
- OIDC ngắn hạn
- runner group riêng
```

Không dùng binary do Zone A tạo để ký hoặc deploy trực tiếp. Hãy build lại từ commit đã merge trong Zone B. Nếu bắt buộc truyền dữ liệu, hãy kiểm tra schema, kích thước, tên file và checksum trước khi dùng. Không giải nén archive không tin cậy vào đường dẫn tùy ý.

## Cô lập self-hosted runner

### Hệ điều hành và máy thực thi

Tài khoản chạy runner phải là service account riêng. Tài khoản này không nên là `root` và không nên có `sudo` không cần mật khẩu. Không đặt SSH key, kubeconfig, cloud CLI profile hoặc credential cá nhân trong `$HOME` của account đó.

Áp dụng các lớp sau:

- dùng VM riêng cho từng job đặc biệt hoặc từng trust zone;
- bật Secure Boot, disk encryption và cơ chế bảo vệ image nếu nền tảng hỗ trợ;
- mount filesystem với quyền tối thiểu;
- đặt workspace trên disk dùng một lần;
- dùng SELinux, AppArmor hoặc cơ chế mandatory access control phù hợp;
- giới hạn CPU, RAM, process và disk để giảm denial of service;
- tắt service, package và cổng inbound không cần thiết;
- không đặt runner trên máy của developer hoặc máy quản trị hạ tầng;
- không chạy control plane của autoscaler trên chính worker nhận job.

Namespace hoặc container giảm tương tác vô tình. Chúng không phải boundary tuyệt đối trước mã độc có khả năng khai thác kernel.

### Docker socket và quyền root

Docker daemon thường chạy với quyền `root`. Người điều khiển `/var/run/docker.sock` có thể mount filesystem host và tạo privileged container. Vì vậy, quyền vào Docker socket thường tương đương quyền root trên host.

Không làm các việc sau cho job không tin cậy:

- mount Docker socket vào container runner;
- thêm runner account vào group `docker` mà không chấp nhận quyền root tương đương;
- chạy container với `--privileged`;
- mount `/`, `/proc`, `/sys`, device hoặc thư mục credential của host;
- dùng host PID, host network hoặc capability rộng;
- chạy Docker API không TLS trên TCP.

Nếu workload cần build container image, ưu tiên builder không cần Docker socket host. Hãy dùng rootless mode, user namespace hoặc sandbox builder khi phù hợp. Các biện pháp này giảm quyền nhưng không biến một host chia sẻ thành nơi an toàn cho nhiều trust zone.

### Kiểm soát mạng ra ngoài

Egress là lưu lượng runner chủ động gửi ra ngoài. Nếu egress mở hoàn toàn, mã độc có thể gửi secret tới bất kỳ host nào. Nếu runner vào được mạng nội bộ, mã độc còn có thể quét và tấn công dịch vụ bên cạnh.

Thiết kế mạng nên dùng deny-by-default:

1. Đặt mỗi trust zone vào subnet hoặc network policy riêng.
2. Chỉ cho phép HTTPS tới endpoint GitHub cần thiết.
3. Chỉ cho phép package registry và artifact store đã duyệt.
4. Chặn RFC1918, control plane và production subnet nếu job không cần.
5. Dùng proxy có log destination, DNS policy và giới hạn băng thông.
6. Không mở cổng inbound từ Internet chỉ để runner nhận job. Self-hosted runner chủ động kết nối outbound tới GitHub.

Các domain cốt lõi thường gồm `github.com`, `api.github.com` và `*.actions.githubusercontent.com`. Workflow có thể cần thêm `codeload.github.com`, endpoint artifact, package registry và endpoint release. Danh sách có CNAME và có thể thay đổi. Hãy đồng bộ firewall từ [danh sách domain theo chức năng của GitHub](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#accessible-domains-by-function) thay vì chép một allowlist cố định từ tài liệu này.

<Callout type="info" title="Egress control không thay thế việc bỏ secret">
  Proxy hoặc firewall có thể bị vượt qua qua một endpoint được phép. Không cấp secret cho mã không tin cậy vẫn là kiểm soát chính. Egress filtering là lớp giảm blast radius.
</Callout>

### Cloud IAM và metadata service

Một VM runner có thể tự nhận quyền từ instance profile, managed identity hoặc service account gắn vào máy. Job không cần secret trong YAML vẫn có thể lấy credential từ metadata service.

Áp dụng least privilege cho cloud:

- không gắn role production thường trực vào runner build;
- chặn metadata endpoint nếu job không cần;
- dùng cơ chế metadata mới nhất và yêu cầu token hoặc hop limit khi cloud hỗ trợ;
- tách account, project, subscription và network theo môi trường;
- dùng OIDC để cấp credential ngắn hạn cho đúng repository, workflow, branch hoặc environment;
- thêm session policy và thời hạn ngắn hơn mức mặc định khi provider hỗ trợ;
- không cho PR event nhận role deploy.

Kiểm tra quyền hiệu dụng từ bên trong image test. Đừng chỉ đọc Terraform và giả định không có credential nào khác trên máy.

## Giới hạn quyền truy cập runner

### Runner groups là boundary truy cập

Runner group trả lời câu hỏi “repository hoặc workflow nào được phép dùng pool này”. Hãy chọn **Selected repositories** thay cho **All repositories**. Với tính năng workflow access, chỉ allowlist reusable workflow hoặc deployment workflow đã được kiểm soát.

Tách ít nhất các group sau khi tổ chức có các workload tương ứng:

- PR validation không đặc quyền;
- build từ branch được bảo vệ;
- signing và release;
- staging deploy;
- production deploy;
- runner quản lý thiết bị hoặc mạng đặc biệt.

Một runner group dùng chung cho toàn organization làm tăng blast radius. Việc thêm repository mới vào group phải qua review và có owner phê duyệt.

### Labels chỉ dùng để định tuyến

Label mô tả năng lực như `linux`, `gpu` hoặc `net-private`. Label không phải authorization boundary. Người quản trị gán nhầm label có thể định tuyến job tới sai pool.

Kết hợp group và labels trong `runs-on`:

```yaml
runs-on:
  group: rg-build-trusted
  labels: [self-hosted, linux, x64, lifecycle-ephemeral]
```

Group giới hạn ai được dùng pool. Labels chọn máy có năng lực đúng trong pool. Boundary thật vẫn phải có ở IAM, mạng, VM và storage.

## Bảo vệ token secret và OIDC

### Giảm quyền token của workflow

Mỗi job có thể truy cập `GITHUB_TOKEN` qua `github.token` ngay cả khi workflow không truyền token rõ ràng cho action. Hãy đặt quyền mặc định của organization hoặc repository thành read-only. Sau đó khai báo `permissions` trong từng workflow hoặc job.

Job không cần GitHub API có thể tắt toàn bộ quyền:

```yaml
permissions: {}
```

Job chỉ checkout source cần quyền đọc nội dung:

```yaml
permissions:
  contents: read
```

Chỉ job phát hành mới nên có `contents: write` hoặc `packages: write`. Không cấp `write-all`. Nếu `GITHUB_TOKEN` không có permission cần thiết, ưu tiên GitHub App installation token có phạm vi hẹp. PAT dài hạn là lựa chọn cuối và phải có owner cùng lịch rotate.

Tắt tùy chọn cho phép GitHub Actions tạo hoặc phê duyệt pull request nếu quy trình không cần. Bảo vệ branch và ruleset vẫn phải áp dụng cho mọi automation có quyền ghi.

### Giảm vòng đời và phạm vi secret

Secret repository có thể được đọc bởi người có quyền write thông qua việc sửa workflow. Secret organization có blast radius rộng hơn. Hãy giới hạn secret organization bằng danh sách repository được chọn.

Áp dụng các quy tắc sau:

- không lưu secret tĩnh trong image, AMI, container layer hoặc user-data;
- dùng environment secret và required reviewers cho deployment;
- tách từng giá trị secret thay vì lưu một blob JSON lớn;
- truyền secret qua environment, standard input hoặc file có mode chặt;
- tránh đưa secret vào command line vì process khác có thể đọc qua `ps`;
- rotate định kỳ và ngay khi nghi ngờ lộ;
- xóa secret không còn owner hoặc không còn workflow sử dụng;
- không truyền secret sang reusable workflow bằng `secrets: inherit` nếu chỉ cần một giá trị.

Redaction của GitHub không được bảo đảm cho mọi biến đổi. Base64, URL encoding hoặc cắt chuỗi có thể làm bộ che log không nhận ra giá trị. Với token được sinh trong job, gọi `::add-mask::` trước khi token có thể xuất hiện trong log.

```bash
printf '::add-mask::%s\n' "$SHORT_LIVED_TOKEN"
```

Không in context `github`, `secrets` hoặc toàn bộ environment để debug. `set -x` cũng có thể in command sau khi shell đã thay biến.

### Dùng OIDC cho cloud

OIDC cho phép job đổi identity do GitHub ký lấy cloud token ngắn hạn. OIDC loại bỏ cloud key dài hạn khỏi GitHub secrets. OIDC không tự tạo least privilege nếu trust policy quá rộng.

Chỉ cấp `id-token: write` cho job thật sự đăng nhập cloud:

```yaml
permissions:
  contents: read
  id-token: write
```

Cloud trust policy phải kiểm tra ít nhất một điều kiện. Nên khóa theo các claim phù hợp:

- `repository` hoặc `repository_id`;
- `repository_owner` hoặc owner ID;
- `environment` cho production;
- `ref` cho branch hoặc tag được bảo vệ;
- `job_workflow_ref` và `job_workflow_sha` cho reusable workflow trung tâm;
- `runner_environment` nếu policy cần phân biệt GitHub-hosted và self-hosted;
- `aud` đúng với cloud provider.

Không dùng wildcard cho toàn organization nếu một repository bị chiếm có thể nhận role production. Cloud role cũng phải chỉ có action và resource cần thiết. Environment required reviewer nên đứng trước job lấy OIDC token.

## Bảo vệ chuỗi cung ứng workflow

### Pin action bằng full commit SHA

Tag như `v4` có thể bị di chuyển. Full commit SHA là cách duy nhất GitHub hiện coi là immutable release cho action. Hãy xác minh SHA thuộc repository action gốc và giữ tag trong comment để người review biết phiên bản.

```yaml
- name: Checkout source
  uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
```

Áp dụng cùng nguyên tắc cho reusable workflow bên ngoài repository. Với container image, pin digest như `image@sha256:...` thay vì chỉ dùng `latest`.

Thiết lập policy organization để chỉ cho phép action đã duyệt và yêu cầu pin full SHA khi gói GitHub hỗ trợ. Dùng Dependabot để mở pull request nâng SHA. Mỗi lần nâng cấp vẫn cần review source, release note và quyền mới.

### Chặn script injection

Dữ liệu như title PR, branch, issue body và matrix value có thể do attacker kiểm soát. Không chèn expression trực tiếp vào script:

```yaml
# Không an toàn nếu title chứa cú pháp shell.
- run: echo "${{ github.event.pull_request.title }}"
```

Đưa dữ liệu vào environment rồi quote biến shell:

```yaml
- name: Validate pull request title
  shell: bash
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: |
    set -euo pipefail
    if [[ "$PR_TITLE" =~ ^(feat|fix|docs):\  ]]; then
      printf 'Title hợp lệ\n'
    else
      printf 'Title không hợp lệ\n' >&2
      exit 1
    fi
```

Tốt hơn nữa, dùng action đã kiểm tra để xử lý input như một argument. Không dùng `eval`. Luôn quote biến và đặt `set -euo pipefail` cho Bash khi phù hợp.

### Bảo vệ workflow cache và artifact

Cache tối ưu tốc độ nhưng không phải kho tin cậy. Workflow đặc quyền không nên restore cache có thể được tạo hoặc tác động bởi PR không tin cậy. Key cache phải gắn với dependency lockfile và trust zone.

Artifact từ job không tin cậy là input độc hại. Trước khi dùng, hãy:

- tải artifact vào thư mục trống;
- giới hạn kích thước và số file;
- chặn path traversal khi giải nén;
- xác minh định dạng và checksum mong đợi;
- không thực thi binary hoặc script từ artifact;
- build lại artifact phát hành trong workflow đặc quyền;
- ký artifact sau khi build trong trust zone phát hành.

Yêu cầu CODEOWNERS cho `.github/workflows/**`, local actions và file cấu hình runner. Branch protection hoặc ruleset phải yêu cầu review từ đội sở hữu pipeline. Code review cần kiểm tra cả thay đổi permission, trigger, `runs-on`, `uses`, cache và secret.

## Vòng đời image cleanup và logging

### Golden image và patching

Golden image là image chuẩn được tạo bằng code và dùng để cấp runner mới. Không chỉnh tay từng runner production. Pipeline image phải tạo được kết quả lặp lại và có inventory thành phần.

Baseline image nên gồm:

- hệ điều hành tối thiểu và package từ nguồn đã duyệt;
- phiên bản runner application đã kiểm tra checksum;
- kernel, container runtime và toolchain còn hỗ trợ;
- cấu hình service account, firewall, audit và time sync;
- CA trust store được quản lý;
- agent logging không chứa credential bootstrap;
- SBOM, image digest và provenance của pipeline build image;
- không có registration token, removal token, PAT hoặc cloud key.

Quy trình patching nên:

1. Theo dõi advisory của OS, Docker hoặc runtime, toolchain và [`actions/runner`](https://github.com/actions/runner/releases).
2. Build image mới thay vì vá fleet bằng SSH.
3. Quét lỗ hổng và chạy test hardening.
4. Rollout một canary pool không có quyền production.
5. Xác nhận routing, log, OIDC và teardown.
6. Thay dần runner cũ rồi thu hồi image cũ.

Nếu tắt auto-update của runner application, GitHub yêu cầu cập nhật trong vòng 30 ngày sau bản phát hành mới. Bản vá bảo mật nghiêm trọng có thể khiến runner cũ bị chặn sớm hơn. Mốc này không áp dụng cho kernel hoặc Docker. Các thành phần đó cần SLA vá lỗi riêng của tổ chức.

### Cleanup và credential persistence

Máy dùng một lần nên bị hủy thay vì “lau sạch” rồi tái sử dụng. Cleanup vẫn cần để giảm cửa sổ rò rỉ trước lúc teardown và xử lý tài nguyên ngoài máy.

Kiểm tra các vị trí sau:

- `$GITHUB_WORKSPACE`, `$RUNNER_TEMP`, `_work` và tool cache;
- `$HOME`, `.gitconfig`, credential helper và file `.netrc`;
- SSH agent, GPG agent, kubeconfig và cloud CLI cache;
- container, image layer, volume, build cache và mount;
- process con, daemon, cron, systemd user service và background job;
- swap, attached disk, snapshot và object tạm;
- package-manager token và registry login;
- artifact hoặc cache đã upload ra dịch vụ bên ngoài.

`actions/checkout` có thể duy trì credential để lệnh Git sau đó xác thực rồi gỡ ở post-job. Đặt `persist-credentials: false` khi workflow không cần push. Không dựa vào post-job hook như boundary duy nhất vì runner có thể crash hoặc bị mã độc can thiệp.

Ephemeral teardown phải chạy theo trạng thái hạ tầng, không phụ thuộc riêng vào kết quả workflow. Autoscaler cần garbage collector cho VM bị mất kết nối, disk mồ côi và registration offline.

### Logging không làm lộ secret

Ephemeral runner mất log cục bộ khi bị hủy. GitHub khuyến nghị chuyển log runner application ra hệ thống bên ngoài trước khi vận hành autoscaling production. Log tập trung cần liên kết được `run_id`, `job_id`, runner name, image digest và instance ID.

Thu thập tối thiểu:

- trạng thái cấp phát, đăng ký, nhận job và teardown;
- log `Runner_` và `Worker_` trong `_diag` theo retention policy;
- audit log thay đổi secret, runner group và Actions policy;
- network destination, DNS deny và cloud IAM event;
- image version, runner version và kết quả kiểm tra patch;
- cảnh báo process hoặc kết nối tồn tại sau job.

Không thu thập toàn bộ environment hoặc command line một cách mù quáng. Log agent phải có redaction trước khi gửi. Quyền đọc log phải hẹp vì log có thể chứa source private, endpoint nội bộ và secret chưa được che.

Nếu log đã lộ secret, hãy lưu bằng chứng cần thiết trong kho hạn chế truy cập. Sau đó rotate secret và xóa workflow log bị lộ theo quy trình. Chỉ xóa log mà không rotate không xử lý được credential đã bị sao chép.

## Bài thực hành workflow an toàn

### Kịch bản

Bài thực hành kiểm thử pull request Node.js từ fork. Job chạy code không tin cậy trên GitHub-hosted runner. Job không có secret, không có OIDC và chỉ đọc source.

Yêu cầu:

- repository có `package-lock.json`;
- test không cần dịch vụ nội bộ;
- Actions policy cho phép `actions/checkout` tại SHA được chọn;
- workflow approval cho contributor bên ngoài đã được cấu hình theo policy tổ chức.

### Workflow mẫu

Tạo `.github/workflows/pr-untrusted.yml`:

```yaml
name: Validate untrusted pull request

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  test:
    name: Test without privileges
    runs-on: ubuntu-24.04
    timeout-minutes: 15

    steps:
      - name: Checkout exact pull request commit
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          persist-credentials: false
          fetch-depth: 1

      - name: Record untrusted title safely
        shell: bash
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          set -euo pipefail
          printf 'PR title length: %s\n' "${#PR_TITLE}"

      - name: Install dependencies without lifecycle scripts
        shell: bash
        run: |
          set -euo pipefail
          npm ci --ignore-scripts

      - name: Run tests
        shell: bash
        env:
          CI: "true"
        run: |
          set -euo pipefail
          npm test
```

Workflow cố ý không có `secrets`, `environment` hoặc `id-token: write`. `persist-credentials: false` ngăn giữ token checkout cho các lệnh Git sau đó. SHA của PR được chọn rõ ràng để log và điều tra có cùng một commit.

`npm test` vẫn thực thi mã từ PR. Điều này chấp nhận được vì job nằm trên GitHub-hosted VM dùng một lần và không có quyền nhạy cảm. Nếu test cần network, chỉ thêm đúng endpoint cần thiết. Không chuyển job này sang persistent self-hosted runner để tận dụng cache.

`--ignore-scripts` chặn lifecycle script trong bước cài dependency. Nếu dự án bắt buộc lifecycle script, hãy bỏ cờ sau khi đánh giá. Job vẫn phải giữ nguyên boundary không đặc quyền.

### Cách kiểm chứng

1. Mở một pull request thử nghiệm từ fork.
2. Xem tab **Files changed** trước khi phê duyệt workflow run.
3. Xác nhận job dùng `ubuntu-24.04`, không dùng label `self-hosted`.
4. Mở phần quyền của job trong log và xác nhận chỉ có `contents: read`.
5. Xác nhận không có environment secret hoặc bước login cloud.
6. Thêm tạm title chứa `"; id; #` và chạy lại.
7. Xác nhận title chỉ được đo độ dài và không tạo lệnh shell mới.
8. Sửa test để in `env` trong một nhánh lab không có secret.
9. Xác nhận không xuất hiện cloud key, PAT hoặc credential nội bộ.
10. Xóa bước debug trước khi merge.

Bài thực hành đạt khi code PR chạy được nhưng không có đường tới credential hoặc self-hosted network. Nếu repository cần một bước publish, hãy đặt bước đó trong workflow khác chạy sau merge từ branch được bảo vệ.

## Checklist hardening

### Quyết định kiến trúc

- [ ] Mỗi workflow đã được phân loại thành untrusted, trusted hoặc privileged.
- [ ] PR từ fork chạy trên GitHub-hosted runner hoặc VM/JIT dùng một lần.
- [ ] Persistent self-hosted runner không nhận mã không tin cậy.
- [ ] Signing, release và production deploy có pool riêng.
- [ ] Ephemeral automation hủy cả compute, disk và registration.

### Quyền truy cập

- [ ] Runner group dùng **Selected repositories**.
- [ ] Workflow access chỉ allowlist workflow cần thiết nếu tính năng khả dụng.
- [ ] Labels chỉ mô tả năng lực và không được coi là authorization.
- [ ] `.github/workflows/**` có CODEOWNERS và branch protection.
- [ ] Actions policy chỉ cho phép action hoặc owner đã duyệt.

### Hệ điều hành và container

- [ ] Runner service chạy bằng account riêng, không phải `root`.
- [ ] Account không có `sudo` không cần mật khẩu.
- [ ] Job không được điều khiển Docker socket host nếu không chấp nhận quyền root tương đương.
- [ ] Không dùng privileged container, host PID hoặc mount host nhạy cảm.
- [ ] CPU, RAM, process và disk có giới hạn.
- [ ] SELinux, AppArmor hoặc policy tương đương đã được đánh giá.

### Mạng và cloud

- [ ] Subnet hoặc network policy tách theo trust zone.
- [ ] Egress mặc định bị chặn và chỉ mở endpoint cần thiết.
- [ ] Runner không có đường mạng đến production nếu job không cần.
- [ ] Metadata service bị chặn hoặc được bảo vệ bằng cơ chế mạnh nhất của provider.
- [ ] Runner build không có instance role production thường trực.
- [ ] OIDC trust policy khóa theo repository, workflow, ref hoặc environment.

### Token và secret

- [ ] `GITHUB_TOKEN` mặc định read-only và mỗi job khai báo `permissions` tối thiểu.
- [ ] Job không cần token dùng `permissions: {}`.
- [ ] Job PR không nhận secret, OIDC hoặc cloud credential.
- [ ] Deployment dùng environment reviewer và credential ngắn hạn.
- [ ] Secret organization chỉ mở cho selected repositories.
- [ ] Token phát sinh trong job được mask trước khi log.
- [ ] Workflow không dùng `set -x` khi xử lý secret.

### Chuỗi cung ứng

- [ ] Action và reusable workflow bên ngoài được pin full commit SHA.
- [ ] Container image nhạy cảm được pin digest.
- [ ] Dependabot theo dõi GitHub Actions dependency.
- [ ] Dữ liệu event được truyền qua environment hoặc argument đã quote.
- [ ] Privileged workflow không checkout code PR.
- [ ] Artifact và cache từ untrusted zone không được dùng trực tiếp để release.

### Vận hành

- [ ] Golden image được tạo bằng code và không chứa credential.
- [ ] Image có SBOM, digest, kết quả scan và owner.
- [ ] Có SLA patch cho OS, kernel, runner application, Docker và toolchain.
- [ ] Rollout image mới qua canary trước production.
- [ ] Runner log được chuyển ra ngoài trước khi ephemeral VM bị hủy.
- [ ] Log pipeline có redaction và quyền đọc hạn chế.
- [ ] Garbage collector xử lý VM, disk và registration mồ côi.
- [ ] Đội vận hành đã diễn tập compromise và rebuild runner.

## Ứng phó sự cố runner

### Dấu hiệu cần coi là compromise

Không chờ bằng chứng hoàn hảo khi thấy một trong các dấu hiệu sau:

- process, container, user hoặc outbound connection lạ còn tồn tại sau job;
- workflow chạy trên runner group không đúng boundary;
- action tag trỏ sang commit bất ngờ;
- secret xuất hiện trong log hoặc network telemetry;
- cloud IAM ghi nhận API ngoài phạm vi job;
- checksum image, runner binary hoặc toolchain không khớp;
- cache, artifact, release hoặc package bị thay đổi không có nguồn gốc;
- persistent runner đã chạy code từ PR không tin cậy;
- runner tắt logging, sửa audit config hoặc liên tục offline bất thường.

Với persistent self-hosted runner, việc đã chạy mã không tin cậy tự nó là đủ để rebuild. Không cần chứng minh mã đã bám trụ.

### Quy trình cô lập và khôi phục

1. **Dừng nhận job mới.** Gỡ runner khỏi group được phép hoặc tắt service bằng control plane tin cậy.
2. **Cô lập mạng.** Chặn egress và đường tới tài nguyên nội bộ. Không tắt máy ngay nếu quy trình pháp chứng cần memory hoặc disk snapshot.
3. **Bảo toàn bằng chứng.** Lưu workflow YAML, event payload, action SHA, run log, `_diag`, image digest, cloud audit và network log.
4. **Thu hồi credential.** Rotate repository, organization và environment secret có thể đã xuất hiện. Thu hồi deploy key, GitHub App token, PAT, registry token và cloud session liên quan.
5. **Giới hạn blast radius.** Kiểm tra commit, branch, release, package, artifact, cache và deployment mà credential bị lộ có thể sửa.
6. **Vô hiệu dữ liệu đầu ra.** Quarantine artifact và cache do runner tạo. Không ký hoặc deploy lại chúng.
7. **Hủy và dựng lại.** Xóa VM, writable disk và registration. Tạo runner mới từ golden image đã vá.
8. **Sửa nguyên nhân gốc.** Thu hẹp trigger, group, token permission, OIDC trust, network hoặc action dependency.
9. **Khôi phục qua canary.** Chạy workflow không đặc quyền trước. Chỉ mở lại production sau khi log và teardown đạt yêu cầu.
10. **Ghi lại sự cố.** Lưu timeline, tài sản bị ảnh hưởng, credential đã rotate và action phòng ngừa có owner.

`GITHUB_TOKEN` thường hết hạn sau job, nhưng không vì thế mà bỏ qua điều tra. Token có thể đã được dùng để sửa repository trong lúc còn hiệu lực. Cloud token ngắn hạn cũng có thể tạo tài nguyên hoặc credential bền vững hơn.

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý an toàn |
|---|---|---|
| PR từ fork nằm ở **Awaiting approval** | Policy yêu cầu maintainer duyệt contributor bên ngoài | Review toàn bộ diff, workflow, local action và build script; chỉ phê duyệt khi job chạy trong untrusted zone |
| PR chạy trên self-hosted runner ngoài ý muốn | `runs-on` quá rộng, group cho phép sai repository hoặc reusable workflow chọn runner | Hủy run, cô lập runner, kiểm tra compromise; sửa group và workflow trước khi chạy lại |
| Job `pull_request_target` cần build code PR | Thiết kế đang trộn metadata automation với code execution | Tách job `pull_request` không đặc quyền; không checkout head SHA trong privileged context |
| `GITHUB_TOKEN` trả về `403` | `permissions` thiếu scope cần thiết | Chỉ tăng đúng permission cho job cần; không đổi sang `write-all` |
| OIDC bị cloud từ chối | `aud`, `sub`, environment, ref hoặc reusable workflow claim không khớp | Đọc claim của một run lab không có quyền production; sửa trust policy tối thiểu ở cả GitHub và provider |
| Job lấy được cloud role ngoài dự kiến | Trust policy dùng wildcard hoặc instance role có sẵn trên runner | Thu hồi session, chặn metadata, thu hẹp claim và role; kiểm tra mọi API đã gọi |
| Secret vẫn xuất hiện trong log | Giá trị đã biến đổi, secret chưa đăng ký hoặc `set -x` in lệnh | Dừng workflow, rotate secret, xóa log sau khi giữ bằng chứng; dùng `add-mask` sớm và tắt xtrace |
| Job sau nhìn thấy file hoặc process của job trước | Persistent runner hoặc teardown không xóa toàn bộ máy | Coi runner bị compromise; thay bằng ephemeral VM; sửa garbage collector thay vì thêm một cleanup lẻ |
| Container job đọc được filesystem host | Docker socket, privileged mode hoặc host mount đã được cấp | Cô lập node, điều tra; bỏ socket/mount; dùng builder hoặc VM riêng với quyền hẹp |
| Egress allowlist làm runner offline | Thiếu endpoint GitHub, artifact, package hoặc CNAME hiện hành | So sánh log proxy với danh sách domain chính thức; chỉ mở đúng chức năng đang dùng |
| Action pin SHA nhưng workflow vẫn bị thay đổi | SHA lấy từ fork, local action bị sửa hoặc dependency runtime không pin | Xác minh owner và commit; bảo vệ local action bằng CODEOWNERS; pin container và dependency lockfile |
| Ephemeral runner biến mất nhưng VM còn chạy | Registration đã gỡ nhưng automation teardown lỗi | Chặn mạng VM, hủy compute và disk; thêm TTL cùng garbage collector độc lập với workflow |
| Không còn `_diag` để điều tra | Log chưa được chuyển ra ngoài trước khi hủy ephemeral runner | Bật log forwarding trong image bootstrap; kiểm tra pipeline log trước khi mở lại pool |
| Runner ngừng nhận job sau khi tắt auto-update | Runner application quá thời hạn hoặc có security update bắt buộc | Build image mới từ release chính thức, kiểm tra checksum, rollout canary rồi thay pool |

Khi troubleshooting, không in token hoặc toàn bộ environment. Tạo một runner canary không có quyền production để kiểm tra DNS, proxy, OIDC và image. Không debug trực tiếp bằng cách nới quyền của pool production.

## Tài liệu tham khảo

Các liên kết dưới đây được đối chiếu với tài liệu hiện hành trong năm 2026:

- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Securely using pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
- [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Approving workflow runs from forks](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks)
- [Use GITHUB_TOKEN for authentication in workflows](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc)
- [Self-hosted runners reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [Managing access to self-hosted runners using groups](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
- [GitHub-hosted runner image releases và SBOM](https://github.com/actions/runner-images/releases)
- [GitHub Actions runner releases](https://github.com/actions/runner/releases)
- [Preventing pwn requests — GitHub Security Lab](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
- [Docker Engine security](https://docs.docker.com/engine/security/)
- [NIST SP 800-190 Application Container Security Guide](https://csrc.nist.gov/pubs/sp/800/190/final)
- [OpenSSF Scorecard checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md)

## Đọc tiếp

<Cards>
  <Card title="Self-hosted runners" href="/docs/runners/02-self-hosted-runners" description="Cài đặt, đăng ký và quản lý vòng đời runner do bạn vận hành." />
  <Card title="Labels và runner groups" href="/docs/runners/03-labels-va-runner-groups" description="Thiết kế định tuyến và policy truy cập cho từng pool." />
  <Card title="Autoscaling với ARC" href="/docs/runners/05-autoscaling-arc" description="Cấp phát runner scale set dùng một lần trên Kubernetes." />
  <Card title="Giám sát và bảo trì runner" href="/docs/runners/07-runner-monitoring-maintenance" description="Theo dõi log, capacity, phiên bản và xử lý sự cố vận hành." />
</Cards>
