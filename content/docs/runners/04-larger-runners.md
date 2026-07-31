---
title: "Larger runners"
description: "Thiết kế, định tuyến, benchmark và vận hành GitHub-hosted larger runners an toàn, có kiểm soát chi phí."
---

<Callout type="info" title="Phạm vi">
  Tài liệu dành cho platform engineer, quản trị viên GitHub Actions và nhóm cần nhiều CPU, RAM, dung lượng đĩa, GPU hoặc kết nối mạng ổn định hơn standard GitHub-hosted runners. Larger runners vẫn là hạ tầng do GitHub quản lý; chúng không phải self-hosted runners cỡ lớn.
</Callout>

## Mục lục

- [Larger runners là gì](#larger-runners-là-gì)
  - [Đối tượng và gói dịch vụ](#đối-tượng-và-gói-dịch-vụ)
  - [Một runner là một pool](#một-runner-là-một-pool)
- [So sánh các mô hình runner](#so-sánh-các-mô-hình-runner)
- [Chọn tài nguyên và image](#chọn-tài-nguyên-và-image)
  - [Machine size](#machine-size)
  - [Hệ điều hành image và kiến trúc](#hệ-điều-hành-image-và-kiến-trúc)
  - [GPU và macOS](#gpu-và-macos)
- [Kết nối mạng](#kết-nối-mạng)
  - [IP động và IP tĩnh công khai](#ip-động-và-ip-tĩnh-công-khai)
  - [Azure private networking](#azure-private-networking)
- [Autoscaling concurrency và hàng đợi](#autoscaling-concurrency-và-hàng-đợi)
  - [Maximum concurrency của pool](#maximum-concurrency-của-pool)
  - [Ba lớp giới hạn song song](#ba-lớp-giới-hạn-song-song)
  - [Thời gian chờ cấp máy](#thời-gian-chờ-cấp-máy)
- [Runner groups và định tuyến](#runner-groups-và-định-tuyến)
  - [Phân quyền bằng runner group](#phân-quyền-bằng-runner-group)
  - [Định tuyến bằng runs-on](#định-tuyến-bằng-runs-on)
- [Khi nào nên chọn larger runners](#khi-nào-nên-chọn-larger-runners)
  - [Tín hiệu nên dùng](#tín-hiệu-nên-dùng)
  - [Khi không nên dùng](#khi-không-nên-dùng)
  - [Bảng quyết định nhanh](#bảng-quyết-định-nhanh)
- [Khung benchmark và chi phí](#khung-benchmark-và-chi-phí)
  - [Thiết kế benchmark công bằng](#thiết-kế-benchmark-công-bằng)
  - [Mô hình chi phí không phụ thuộc bảng giá](#mô-hình-chi-phí-không-phụ-thuộc-bảng-giá)
  - [Diễn giải kết quả](#diễn-giải-kết-quả)
- [Bài thực hành benchmark](#bài-thực-hành-benchmark)
  - [Yêu cầu chuẩn bị](#yêu-cầu-chuẩn-bị)
  - [Workflow có thể chạy](#workflow-có-thể-chạy)
  - [Đọc và kiểm chứng kết quả](#đọc-và-kiểm-chứng-kết-quả)
- [Quản trị vòng đời](#quản-trị-vòng-đời)
  - [Tạo và thay đổi cấu hình](#tạo-và-thay-đổi-cấu-hình)
  - [Bảo mật và phân quyền](#bảo-mật-và-phân-quyền)
  - [Quan sát ngân sách và năng lực](#quan-sát-ngân-sách-và-năng-lực)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)
- [Trang liên quan](#trang-liên-quan)

## Larger runners là gì

**Larger runners** là các máy ảo GitHub-hosted có cấu hình và khả năng mạng mở rộng so với standard GitHub-hosted runners. GitHub cài runner application, cấp máy cho job và hủy môi trường sau khi job kết thúc. Nhóm vận hành không phải vá hệ điều hành hay duy trì runner service như với self-hosted runners.

Điểm khác biệt không chỉ nằm ở số vCPU. Một larger runner có thể cung cấp:

- nhiều CPU, RAM và SSD hơn cho compile, test, phân tích mã hoặc build image;
- lựa chọn x64, arm64, GPU và các hệ điều hành được GitHub hỗ trợ;
- runner groups để giới hạn repository nào được dùng pool;
- autoscaling tới mức song song do quản trị viên đặt;
- dải IP công khai tĩnh hoặc kết nối vào Azure Virtual Network trong các cấu hình được hỗ trợ;
- GitHub-owned images, một số partner images và custom images tùy platform.

### Đối tượng và gói dịch vụ

Theo [tài liệu quản lý larger runners](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/manage-larger-runners), tính năng này dành cho **organization** và **enterprise** trên **GitHub Team** hoặc **GitHub Enterprise Cloud**. Organization owner hoặc enterprise owner quản lý runner; repository chỉ dùng được runner sau khi được runner group cấp quyền.

Larger runners là tài nguyên tính phí theo thời gian job thực thi. Chúng luôn bị tính phí, kể cả repository public, và không sử dụng số phút miễn phí kèm theo gói. Tài khoản cần phương thức thanh toán hợp lệ và ngân sách GitHub Actions cho phép chi tiêu. Xem quy tắc hiện hành tại [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

<Callout type="warn" title="Kiểm tra availability trước khi thiết kế">
  Machine size, image, kiến trúc, region, giới hạn concurrency và trạng thái preview thay đổi theo thời gian. Hãy coi giao diện <strong>Settings → Actions → Runners</strong> cùng [Larger runners reference](https://docs.github.com/en/actions/reference/runners/larger-runners) là nguồn sự thật, thay vì sao chép một bảng cấu hình cố định vào tiêu chuẩn nội bộ.
</Callout>

### Một runner là một pool

Tên “runner” trong màn hình quản trị dễ gây hiểu nhầm. Một larger runner được cấu hình thực chất đại diện cho **pool máy đồng nhất**: cùng platform, image, machine size, runner group và maximum concurrency. Khi có nhiều job, GitHub tạo nhiều instance từ cấu hình đó tới giới hạn của pool.

```text
Workflow jobs
     │
     ▼
GitHub Actions queue
     │  route theo group + label
     ▼
Larger runner pool (maximum concurrency = N)
     ├──► VM tạm thời cho job 1
     ├──► VM tạm thời cho job 2
     └──► ... tối đa N job đang chạy
```

Các job không chia sẻ workspace hoặc trạng thái đĩa. Nếu cần tái sử dụng dependency, hãy dùng Actions cache, artifact, package registry hoặc custom image; đừng dựa vào file còn lại từ job trước.

## So sánh các mô hình runner

| Tiêu chí | Standard GitHub-hosted | Larger runner | Self-hosted runner |
|---|---|---|---|
| Chủ thể vận hành máy | GitHub | GitHub | Tổ chức của bạn |
| Vòng đời job | Môi trường mới cho từng job | Môi trường mới cho từng job | Tùy thiết kế; máy dài hạn dễ giữ trạng thái ngoài ý muốn |
| CPU RAM đĩa | Cấu hình chuẩn theo label | Chọn size trong danh mục hỗ trợ | Tùy hạ tầng tự cấp |
| Image | GitHub-maintained image theo label | GitHub-owned, partner hoặc custom tùy platform | Tự xây và tự vá |
| Định tuyến | Label chuẩn như `ubuntu-latest` | Tên runner trở thành label; có runner group | Labels và runner groups |
| Mạng riêng | Không phải lựa chọn mặc định | Azure VNET trên cấu hình hỗ trợ | Tự kết nối VPC, VNET hoặc mạng tại chỗ |
| IP allowlist | Dải dùng chung rộng và thay đổi | Có thể cấp dải IP công khai tĩnh trên cấu hình hỗ trợ | Tự kiểm soát egress IP |
| Autoscaling | GitHub quản lý theo hạn mức tài khoản | GitHub quản lý, bị chặn bởi maximum concurrency của pool | Tự triển khai, ví dụ ARC hoặc autoscaling group |
| Trách nhiệm bảo trì | Thấp | Thấp | Cao: patch, runner update, capacity, cleanup, hardening |
| Mô hình chi phí | Phút GitHub-hosted; standard public có ngoại lệ miễn phí | Luôn tính phí theo SKU và thời gian chạy | Không tính Actions minutes, nhưng trả hạ tầng và vận hành |
| Mức tùy biến | Thấp | Trung bình đến cao | Cao nhất |

Larger runners phù hợp khi cần **dịch vụ managed nhưng nhiều tài nguyên hoặc khả năng mạng hơn**. Self-hosted phù hợp hơn khi cần phần cứng đặc thù, hypervisor feature, hệ điều hành không được hỗ trợ, kiểm soát kernel hoặc kết nối ngoài phạm vi giải pháp hosted.

## Chọn tài nguyên và image

### Machine size

Chọn size theo nút thắt đã đo được, không theo cảm giác. Mối quan hệ thường gặp:

- **CPU:** compile song song, test shard, static analysis và compression có thể hưởng lợi từ nhiều core.
- **RAM:** linker, Android build, monorepo TypeScript, data processing hoặc nhiều service container có thể hết bộ nhớ trước khi hết CPU.
- **SSD:** checkout lớn, Docker layer, build artifact hoặc simulator cần cả dung lượng lẫn thông lượng I/O.
- **GPU:** workload CUDA, machine learning hoặc kiểm thử tăng tốc chỉ nên dùng GPU runner khi toolchain thực sự dùng GPU.

Danh mục hiện hành có nhiều mức CPU, RAM và SSD cho Ubuntu, Windows, macOS, x64, arm64 và GPU. Các tổ hợp không đồng đều: chọn image trước có thể làm thay đổi danh sách size có thể chọn. Tra [machine sizes for larger runners](https://docs.github.com/en/actions/reference/runners/larger-runners#machine-sizes-for-larger-runners) ngay tại thời điểm triển khai.

<Callout type="idea" title="Bắt đầu từ size nhỏ nhất giải quyết được nút thắt">
  Tăng vCPU không làm một test đơn luồng chạy nhanh tương ứng. Hãy đo CPU utilization, peak RSS, dung lượng đĩa, queue time và thời gian từng phase; sau đó chỉ tăng tài nguyên đang bão hòa.
</Callout>

### Hệ điều hành image và kiến trúc

Một cấu hình larger runner gồm ba quyết định liên quan chặt chẽ:

1. **Platform:** Linux x64, Linux arm64, Windows x64 hoặc lựa chọn khác đang được giao diện hỗ trợ.
2. **Image:** GitHub-owned image, partner image hoặc custom image tùy platform.
3. **Size:** chỉ các size tương thích với platform và image đã chọn mới xuất hiện.

GitHub-owned images được cập nhật bởi GitHub và có danh sách phần mềm tại repository [`actions/runner-images`](https://github.com/actions/runner-images). Partner images đến từ Azure Marketplace và do đối tác chịu trách nhiệm. Custom images cho phép cài sẵn SDK, dependency hoặc policy để giảm setup time; chúng cũng tạo thêm vòng đời vá lỗi, version và chi phí lưu trữ. Xem [Using custom images](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/use-custom-images) trước khi áp dụng.

Nên pin phiên bản image/OS đủ cụ thể cho pipeline nhạy cảm thay vì mặc định dùng `latest`. Nhãn `latest` nghĩa là image ổn định mới nhất do GitHub cung cấp, không nhất thiết là phiên bản hệ điều hành mới nhất của nhà sản xuất. Với arm64, kiểm tra cả binary lẫn community action; GitHub-authored actions có hỗ trợ tốt hơn nhưng action bên thứ ba có thể chỉ phát hành x64.

### GPU và macOS

GPU runner chỉ có lợi khi công cụ có thể xác nhận GPU được sử dụng. Ghi lại driver, CUDA hoặc runtime version trong log benchmark để tránh so sánh hai môi trường khác toolchain.

macOS larger runners có các giới hạn riêng. Theo [Larger runners reference](https://docs.github.com/en/actions/reference/runners/larger-runners#limitations-for-macos-larger-runners), macOS không hỗ trợ Azure private networking hoặc IP tĩnh. Nested virtualization cũng không được hỗ trợ. arm64 macOS không có static UDID; nếu quy trình ký và kiểm thử cần UDID tĩnh, hãy kiểm tra lựa chọn Intel và hướng dẫn Apple trước khi thiết kế pipeline.

## Kết nối mạng

### IP động và IP tĩnh công khai

Mặc định, larger runner nhận IP động và địa chỉ có thể thay đổi ở mỗi job. Với GitHub Enterprise Cloud, cấu hình được hỗ trợ có thể nhận **dải IP công khai tĩnh duy nhất cho pool**. Đây là một dải dùng chung cho các instance trong pool, không phải một địa chỉ duy nhất gắn vĩnh viễn vào một máy.

IP tĩnh hữu ích khi firewall của artifact repository, SaaS hoặc deployment target chỉ cho phép egress từ allowlist. Quy trình an toàn là:

1. bật static public IP range trên larger runner;
2. lấy toàn bộ dải hiển thị trong cấu hình runner;
3. cập nhật allowlist ở đích;
4. kiểm tra cả kết nối ứng dụng lẫn endpoint GitHub bắt buộc;
5. giám sát thay đổi cấu hình và kiểm tra lại sau thời gian dài không sử dụng.

GitHub giới hạn số pool có dải IP tĩnh và có thể thu hồi dải của runner không được dùng trong thời gian dài. Không hard-code số lượng hoặc thời hạn vào capacity plan; kiểm tra phần [Networking for larger runners](https://docs.github.com/en/actions/reference/runners/larger-runners#networking-for-larger-runners) và [Actions limits](https://docs.github.com/en/actions/reference/limits) hiện hành.

<Callout type="warn" title="IP tĩnh không biến code không tin cậy thành an toàn">
  Không cấp public repository hoặc workflow chạy mã từ fork không tin cậy quyền dùng pool có IP nằm trong allowlist nhạy cảm. Một pull request độc hại có thể lợi dụng chính danh tính mạng đó để truy cập hệ thống đích.
</Callout>

### Azure private networking

Azure private networking đưa network interface của GitHub-hosted runner vào subnet Azure VNET do tổ chức kiểm soát. Runner có thể truy cập private endpoint, package registry, secret manager hoặc mạng on-premises đi qua VPN hay ExpressRoute mà không cần mở dịch vụ ra internet.

Khả năng này có các ràng buộc quan trọng:

- organization owner trên GitHub Team có thể cấu hình ở cấp organization; GitHub Enterprise Cloud có luồng quản trị tương ứng ở cấp enterprise;
- chỉ một số size Ubuntu và Windows, kiến trúc và Azure region được hỗ trợ;
- macOS larger runners không thể vào runner group có network configuration;
- VNET injection dùng IP động, **không kết hợp static public IP của larger runner**;
- subnet phải đủ địa chỉ cho maximum concurrency cộng buffer; NSG, route table, DNS và outbound policy của VNET áp dụng lên runner;
- GitHub không cần inbound connection vào runner, vì vậy nên chặn inbound rõ ràng.

Danh sách size và region là dữ liệu thay đổi. Kiểm tra [About Azure private networking for GitHub-hosted runners](https://docs.github.com/en/organizations/managing-organization-settings/about-azure-private-networking-for-github-hosted-runners-in-your-organization) trước khi cấp subnet.

Nói ngắn gọn: dùng **static public IP** khi hệ thống đích chấp nhận allowlist internet; dùng **Azure VNET** khi cần tuyến private và policy mạng do bạn kiểm soát.

## Autoscaling concurrency và hàng đợi

### Maximum concurrency của pool

`Maximum concurrency` là số job tối đa có thể chạy đồng thời trên các instance của một larger runner pool. GitHub scale pool theo nhu cầu tới giá trị này. Khi tất cả slot bận, job phù hợp vẫn ở hàng đợi dù organization còn quota concurrency ở nơi khác.

Ví dụ, pool `ubuntu-build-16c` có maximum concurrency bằng 8. Mười hai job cùng nhắm tới label này sẽ có tối đa tám job chạy; bốn job còn lại chờ slot. Tạo thêm một runner object cùng loại không phải cách mặc định để tăng scale: trước hết hãy đánh giá và điều chỉnh maximum concurrency của pool hiện có.

Maximum concurrency là **trần năng lực**, không phải số VM luôn chạy. Theo [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing), cấu hình larger runner khi không chạy workflow không phát sinh compute charge; job chỉ bị tính phí khi thực thi. Custom image storage và các sản phẩm liên quan vẫn có mô hình tính phí riêng.

### Ba lớp giới hạn song song

Năng lực thực tế là giới hạn nhỏ nhất trong ba lớp:

1. **Pool:** maximum concurrency của larger runner cụ thể.
2. **Account và runner type:** tổng concurrent jobs theo plan, cùng các trần riêng cho macOS, GPU hoặc loại runner. Xem [Job concurrency limits](https://docs.github.com/en/actions/reference/limits#job-concurrency-limits-for-github-hosted-runners).
3. **Workflow:** `strategy.max-parallel`, `jobs.<job_id>.concurrency`, environment approval và dependency `needs` có thể chủ động tuần tự hóa job.

Đừng nhầm `concurrency` trong workflow với maximum concurrency của runner. Cấu hình workflow dùng để hủy hoặc xếp hàng run cùng một khóa nghiệp vụ, ví dụ chỉ một deploy production. Cấu hình pool dùng để giới hạn capacity và chi phí của hạ tầng thực thi.

### Thời gian chờ cấp máy

Standard GitHub-hosted pools thường có nhiều máy warm hơn. Larger runner pool nhỏ hơn có thể cần cấp VM khi nhận yêu cầu đầu tiên, làm tăng thời gian từ lúc job được tạo đến lúc được gán máy. GitHub mô tả hành vi warm pool và các nguyên nhân chậm tại [Troubleshooting larger runners](https://docs.github.com/en/actions/reference/runners/larger-runners#troubleshooting-larger-runners).

Tách hai chỉ số khi theo dõi:

- **queue-to-assigned:** từ lúc job được tạo đến lúc runner nhận job;
- **execution duration:** từ lúc job bắt đầu chạy đến lúc hoàn tất.

Tăng machine size chỉ có thể cải thiện execution duration. Tăng maximum concurrency có thể giảm chờ do hết slot, nhưng không loại bỏ provisioning delay hoặc giới hạn tổng của tài khoản.

## Runner groups và định tuyến

### Phân quyền bằng runner group

Runner group vừa là ranh giới truy cập vừa là một phần của định tuyến. Với runner cấp organization, mặc định các repository trong organization có thể được cấp quyền rộng; quản trị viên nên chuyển sang **Selected repositories** cho pool có chi phí cao, IP tĩnh, VNET hoặc quyền deploy. Với runner group chia sẻ từ enterprise, phải cấp organization trước rồi cấp repository ở cấp organization.

Một cấu trúc thực tế có thể là:

- `ci-general`: build và test thông thường, không vào mạng production;
- `ci-arm64`: repository phát hành artifact arm64;
- `deploy-private`: chỉ repository deployment, nối VNET và yêu cầu environment approval;
- `image-builders`: chỉ workflow tạo custom image, tách khỏi repository phát triển.

Quyền runner group trả lời câu hỏi “repository nào **có thể** dùng pool”. `runs-on` trả lời “job này **muốn** vào pool nào”. Cả hai phải khớp thì job mới được gán runner.

### Định tuyến bằng runs-on

Larger runner tự nhận workflow label trùng với tên được đặt khi tạo runner. Ví dụ quản trị viên tạo runner tên `ubuntu-24-16c-build` trong group `ci-general`.

Chỉ định theo label:

```yaml
jobs:
  build:
    runs-on: ubuntu-24-16c-build
    steps:
      - run: echo "Chạy trên larger runner theo label"
```

Chỉ định theo group, phù hợp khi bất kỳ runner nào trong group đều đáp ứng job:

```yaml
jobs:
  build:
    runs-on:
      group: ci-general
    steps:
      - run: echo "Chạy trên một runner thuộc group ci-general"
```

Kết hợp group và label để runner phải thỏa cả hai điều kiện:

```yaml
jobs:
  build:
    runs-on:
      group: ci-general
      labels: ubuntu-24-16c-build
    steps:
      - run: echo "Group đúng và machine profile đúng"
```

Có thể đưa label vào organization variable để đổi pool mà không sửa nhiều workflow:

```yaml
jobs:
  build:
    runs-on:
      group: ci-general
      labels: ${{ vars.LARGER_RUNNER_LABEL }}
```

<Callout type="warn" title="Tên runner là API đối với workflow">
  Đổi tên larger runner cũng đổi label tự động của nó. Hãy tìm tất cả workflow và reusable workflow đang dùng label cũ, chuyển đổi có kế hoạch, rồi mới xóa hoặc đổi tên pool.
</Callout>

Nếu tổ chức vô hiệu hóa standard GitHub-hosted runners, workflow phải định tuyến qua runner groups theo policy của tổ chức. Cú pháp và hành vi mới nhất nằm tại [Running jobs on larger runners](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/use-larger-runners).

## Khi nào nên chọn larger runners

### Tín hiệu nên dùng

Chọn larger runner khi benchmark chỉ ra ít nhất một lợi ích có thể đo:

- standard runner hết RAM, hết đĩa hoặc thường xuyên timeout;
- build/test có thể song song hóa và giảm đáng kể critical path khi tăng core;
- cần build hoặc test native arm64 mà không muốn tự vận hành máy;
- cần GPU được GitHub hỗ trợ;
- đích deployment yêu cầu allowlist từ dải IP ổn định;
- workload phải truy cập Azure VNET hoặc mạng on-premises nối với VNET;
- cần custom image để cài sẵn toolchain lớn nhưng vẫn muốn VM tạm thời do GitHub quản lý;
- chi phí thời gian chờ của kỹ sư lớn hơn phần tăng compute cost đã đo.

### Khi không nên dùng

Không nên dùng larger runner như phản xạ đầu tiên trong các trường hợp sau:

- job nhẹ, chủ yếu chờ API hoặc tải mạng;
- test đơn luồng không tận dụng thêm core;
- cache key sai hoặc dependency luôn bị tải lại; sửa cache thường rẻ hơn tăng máy;
- workflow đang tuần tự vì `needs` hoặc concurrency group, không phải vì thiếu runner;
- cần kernel module, nested virtualization, thiết bị phần cứng hoặc OS không được hỗ trợ;
- workload đều đặn 24/7 và hạ tầng self-hosted đã có đội vận hành đủ năng lực; cần làm tổng chi phí sở hữu trước khi quyết định;
- repository public hiện dùng standard runner miễn phí và không có yêu cầu tài nguyên hay mạng bắt buộc;
- muốn giữ workspace giữa các job. Hãy dùng cache/artifact thay vì dựa vào trạng thái máy.

### Bảng quyết định nhanh

| Nhu cầu chính | Lựa chọn khởi đầu | Lý do |
|---|---|---|
| CI phổ thông, không có nút thắt | Standard GitHub-hosted | Ít cấu hình, đủ cho phần lớn job |
| Nhiều CPU RAM đĩa, muốn managed | Larger runner | Scale theo pool, GitHub vận hành VM |
| Allowlist public egress | Larger runner với static IP | Dải riêng cho pool trên cấu hình hỗ trợ |
| Truy cập private resource trong Azure | Larger runner với Azure VNET | NIC trong subnet và dùng policy VNET |
| Phần cứng hoặc OS đặc thù | Self-hosted | Toàn quyền kiểm soát môi trường |
| Autoscaling Kubernetes đã chuẩn hóa | Self-hosted với ARC | Tổ chức kiểm soát pod, image và cluster |
| macOS cần private networking | Đánh giá self-hosted | macOS larger runner không hỗ trợ VNET |

## Khung benchmark và chi phí

### Thiết kế benchmark công bằng

Một benchmark dùng để ra quyết định nên tuân theo khung sau:

1. **Cố định workload:** cùng commit, dependency lockfile, test shard và input data.
2. **Cố định phần mềm:** cùng phiên bản OS/toolchain nếu có thể. Ghi lại image, architecture và tool versions.
3. **Tách cache:** đo cả cold cache và warm cache. Không so một bên cache hit với một bên cache miss.
4. **Lặp lại:** chạy ít nhất vài lần ở các khung giờ đại diện; dùng median và p95 thay vì chỉ lấy lần nhanh nhất.
5. **Đo theo phase:** setup, checkout, restore cache, compile, test, package, upload và queue time.
6. **Theo dõi tài nguyên:** CPU utilization, peak memory, dung lượng đĩa và I/O. Thời gian giảm mà CPU vẫn nhàn có thể đến từ yếu tố khác.
7. **Đo độ tin cậy:** tỷ lệ fail, retry và timeout. Một máy nhanh nhưng flaky có thể đắt hơn.

Bộ KPI tối thiểu:

| KPI | Câu hỏi trả lời |
|---|---|
| Median và p95 execution duration | Larger runner nhanh hơn ổn định hay chỉ có một lần may mắn? |
| Median queue-to-assigned | Pool có thiếu slot hoặc chậm cấp máy không? |
| Peak RAM và disk | Có thể giảm size mà vẫn đủ headroom không? |
| CPU utilization theo phase | Thêm core có được dùng không? |
| Success rate và số lần rerun | Tốc độ có đánh đổi độ ổn định không? |
| Billable minutes theo SKU | Chi phí GitHub thực tế cho mỗi phương án là bao nhiêu? |
| Cost per successful build | Retry và failure làm thay đổi kinh tế thế nào? |

### Mô hình chi phí không phụ thuộc bảng giá

GitHub thay đổi SKU và giá theo thời gian, vì vậy không ghi một con số cố định vào tài liệu thiết kế. Lấy đơn giá hiện hành từ [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) hoặc [GitHub pricing calculator](https://github.com/pricing/calculator?feature=actions).

Với mỗi job `j`, ước lượng compute cost:

```text
billable_minutes(j) = ceil(execution_seconds(j) / 60)
compute_cost(j)      = billable_minutes(j) × current_rate(runner_SKU_j)
workflow_cost        = tổng compute_cost của tất cả job
monthly_cost         = workflow_cost × số workflow run dự kiến mỗi tháng
```

GitHub làm tròn phút lẻ của từng job lên phút nguyên. Vì vậy tách một tác vụ 70 giây thành nhiều job rất ngắn có thể tăng billable minutes dù wall-clock giảm.

Bổ sung các thành phần sau nếu có:

- artifact và cache storage vượt allowance;
- custom image storage theo dữ liệu lưu giữ theo thời gian;
- số lần rerun do flaky test;
- số nhánh, pull request và scheduled run mỗi tháng;
- mức song song cực đại để dự báo burn rate theo giờ;
- chi phí cơ hội do kỹ sư chờ CI, nhưng tách riêng khỏi hóa đơn GitHub.

Larger runner không dùng included minutes, không miễn phí cho public repository và chỉ tính compute khi workflow thực thi. Static public IP không có phụ phí riêng theo tài liệu giá hiện hành, nhưng vẫn phải kiểm tra lại trang giá khi phê duyệt ngân sách.

### Diễn giải kết quả

Giả sử larger runner có đơn giá mỗi phút cao hơn nhưng hoàn thành build nhanh hơn. Đừng chỉ so tỷ lệ thời gian. Hãy so:

```text
cost_per_success = tổng chi phí của run thành công và các lần retry / số build thành công
```

Ba kết luận thường gặp:

- **Nhanh hơn và rẻ hơn mỗi build:** workload tận dụng tốt thêm core; larger runner là ứng viên rõ ràng.
- **Nhanh hơn nhưng đắt hơn:** quyết định dựa trên critical path, SLA và giá trị thời gian kỹ sư.
- **Không nhanh hơn đáng kể:** workload bị chặn bởi mạng, cache, serial phase hoặc external service; tối ưu workflow trước.

Định luật Amdahl là lời nhắc hữu ích: phần tuần tự của pipeline đặt trần cho lợi ích từ thêm CPU. Nếu checkout và tải dependency chiếm 60% thời gian, tăng core chỉ tác động lên 40% còn lại.

## Bài thực hành benchmark

### Yêu cầu chuẩn bị

Bạn cần:

- organization trên GitHub Team hoặc GitHub Enterprise Cloud;
- một larger runner Linux đã được tạo và repository hiện tại có quyền truy cập qua runner group;
- label chính xác của larger runner, lấy tại **Repository → Actions → Runners**;
- Actions budget lớn hơn 0 và phương thức thanh toán hợp lệ;
- quyền tạo và chạy workflow trong repository.

Workflow dưới đây chạy cùng một chương trình Python trên `ubuntu-24.04` và label larger runner nhập lúc dispatch. Nó đo một CPU workload song song cố định và đọc/ghi file tạm 256 MiB. Đây là smoke benchmark có thể chạy, không thay thế workload thật của dự án.

### Workflow có thể chạy

Tạo `.github/workflows/larger-runner-benchmark.yml` trong repository thử nghiệm:

```yaml
name: Larger runner benchmark

on:
  workflow_dispatch:
    inputs:
      larger_runner_label:
        description: Exact workflow label of the Linux larger runner
        required: true
        type: string

permissions:
  contents: read

jobs:
  benchmark:
    name: Benchmark ${{ matrix.runner_name }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - runner_name: standard
            runner_label: ubuntu-24.04
          - runner_name: larger
            runner_label: ${{ inputs.larger_runner_label }}
    runs-on: ${{ matrix.runner_label }}
    timeout-minutes: 20

    steps:
      - name: Record machine information
        shell: bash
        run: |
          echo "runner_name=${{ matrix.runner_name }}"
          echo "runner_label=${{ matrix.runner_label }}"
          uname -a
          lscpu
          free -h
          df -h "$RUNNER_TEMP"
          python3 --version

      - name: Run fixed CPU and disk workload
        shell: bash
        env:
          RUNNER_VARIANT: ${{ matrix.runner_name }}
          REQUESTED_LABEL: ${{ matrix.runner_label }}
        run: |
          python3 <<'PY'
          import concurrent.futures
          import hashlib
          import json
          import multiprocessing
          import os
          import pathlib
          import tempfile
          import time

          TASKS = 16
          ITERATIONS = 1_000_000
          FILE_SIZE_MIB = 256
          BLOCK = b"x" * (1024 * 1024)

          def cpu_task(index):
              salt = f"larger-runner-{index}".encode()
              return hashlib.pbkdf2_hmac(
                  "sha256", b"github-actions-benchmark", salt, ITERATIONS
              ).hex()

          cpu_count = os.cpu_count() or 1
          workers = min(cpu_count, TASKS)
          started = time.perf_counter()
          with concurrent.futures.ProcessPoolExecutor(
              max_workers=workers,
              mp_context=multiprocessing.get_context("fork"),
          ) as executor:
              digests = list(executor.map(cpu_task, range(TASKS)))
          cpu_seconds = time.perf_counter() - started

          temp_dir = pathlib.Path(os.environ["RUNNER_TEMP"])
          with tempfile.NamedTemporaryFile(dir=temp_dir, delete=False) as handle:
              file_path = pathlib.Path(handle.name)
              started = time.perf_counter()
              for _ in range(FILE_SIZE_MIB):
                  handle.write(BLOCK)
              handle.flush()
              os.fsync(handle.fileno())
              write_seconds = time.perf_counter() - started

          started = time.perf_counter()
          bytes_read = 0
          with file_path.open("rb") as handle:
              while chunk := handle.read(1024 * 1024):
                  bytes_read += len(chunk)
          read_seconds = time.perf_counter() - started
          file_path.unlink()

          result = {
              "variant": os.environ["RUNNER_VARIANT"],
              "requested_label": os.environ["REQUESTED_LABEL"],
              "image_os": os.getenv("ImageOS", "unknown"),
              "architecture": os.uname().machine,
              "logical_cpu_count": cpu_count,
              "cpu_workers": workers,
              "cpu_seconds": round(cpu_seconds, 3),
              "disk_file_mib": bytes_read // (1024 * 1024),
              "disk_write_seconds": round(write_seconds, 3),
              "disk_read_seconds": round(read_seconds, 3),
              "digest_guard": digests[0][:16],
          }

          pathlib.Path("benchmark.json").write_text(
              json.dumps(result, indent=2) + "\n", encoding="utf-8"
          )
          pathlib.Path("benchmark.md").write_text(
              "\n".join([
                  f"## {result['variant']} benchmark",
                  "",
                  "| Metric | Value |",
                  "|---|---:|",
                  f"| Requested label | `{result['requested_label']}` |",
                  f"| Image OS | `{result['image_os']}` |",
                  f"| Architecture | `{result['architecture']}` |",
                  f"| Logical CPUs | {result['logical_cpu_count']} |",
                  f"| CPU workers | {result['cpu_workers']} |",
                  f"| CPU workload | {result['cpu_seconds']} s |",
                  f"| Write 256 MiB | {result['disk_write_seconds']} s |",
                  f"| Read 256 MiB | {result['disk_read_seconds']} s |",
                  "",
              ]),
              encoding="utf-8",
          )
          print(json.dumps(result, indent=2))
          PY

          cat benchmark.md >> "$GITHUB_STEP_SUMMARY"

      - name: Upload raw benchmark result
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-${{ matrix.runner_name }}-${{ github.run_id }}
          path: benchmark.json
          retention-days: 7
```

### Đọc và kiểm chứng kết quả

1. Mở tab **Actions**, chọn workflow và bấm **Run workflow**.
2. Nhập đúng label larger runner. Nếu pool còn ở default group nhưng repository không có quyền, job sẽ chờ thay vì tự fallback sang standard runner.
3. Sau khi hai matrix job kết thúc, mở **Job summary** và so `CPU workload`, `Write 256 MiB`, `Read 256 MiB`.
4. Kiểm tra log `Record machine information` để xác nhận số CPU, RAM, architecture và image đúng như dự kiến.
5. Tải hai artifact JSON nếu muốn đưa số liệu vào script phân tích.
6. Lặp workflow nhiều lần. Dùng median thay vì kết luận từ một run.
7. Thay smoke workload bằng lệnh build/test thật của repository trước quyết định production.

Kết quả hợp lệ khi hai job chạy cùng image family và cùng workload, larger job thực sự dùng label đã nhập, JSON được tạo cho cả hai, và không có cache hoặc dependency bên ngoài làm lệch một phía. Thời gian đọc file có thể chịu ảnh hưởng page cache; hãy xem nó là tín hiệu tương đối, không phải chứng nhận thông lượng storage.

<Callout type="info" title="Đo queue time riêng">
  Script chỉ chạy sau khi VM đã nhận job nên không đo provisioning delay. Lấy thời điểm created, started và completed của job từ GitHub UI hoặc Actions API để tính queue-to-assigned; sau đó cộng cả queue time khi đánh giá trải nghiệm của lập trình viên.
</Callout>

## Quản trị vòng đời

### Tạo và thay đổi cấu hình

Luồng quản trị cơ bản tại cấp organization:

1. Vào **Organization Settings → Actions → Runners**.
2. Chọn **New runner → New GitHub-hosted runner**.
3. Đặt tên thể hiện OS, architecture, size và mục đích, ví dụ `ubuntu24-x64-16c-ci`.
4. Chọn platform, image và size từ các lựa chọn thực tế đang hiển thị.
5. Đặt maximum concurrency theo tải dự kiến và ngân sách.
6. Gán runner group có repository access tối thiểu.
7. Nếu cần, cấu hình static public IP hoặc gắn network configuration tương thích.
8. Chạy smoke workflow, xác nhận label, toolchain, mạng và chi phí trước khi chuyển workload.

Size có thể thay đổi trong cấu hình runner. Image có thể thay đổi trong các lựa chọn được hỗ trợ; thay platform hoặc chuyển sang custom image có thể cần runner mới. Mọi thay đổi phải được thử bằng canary repository vì instance mới sẽ dùng cấu hình mới.

Đối với custom images, dùng runner group riêng cho image generation, pin version cho production nếu cần rollout kiểm soát, đặt retention policy và rebuild định kỳ để nhận security patch. Mỗi version giữ lại làm tăng storage usage.

### Bảo mật và phân quyền

- Chỉ cấp runner group cho selected private repositories khi pool có IP tĩnh, VNET hoặc quyền deploy.
- Không chạy code từ fork không tin cậy trên pool có network identity nhạy cảm.
- Đặt `permissions` của `GITHUB_TOKEN` ở mức tối thiểu và dùng OIDC thay cho cloud secret dài hạn.
- Kết hợp protected environments, required reviewers và branch protection cho deployment.
- Giới hạn Actions được phép dùng; pin action của bên thứ ba theo full commit SHA trong môi trường rủi ro cao.
- Không ghi secret vào custom image. Secret phải được cấp lúc chạy từ GitHub Secrets hoặc secret manager.
- Với VNET, chặn inbound, giới hạn outbound qua NSG/firewall, cấu hình DNS rõ ràng và giữ các endpoint GitHub bắt buộc.
- Rà soát repository access, group membership, network configuration và custom image producer định kỳ.

VM tạm thời làm giảm rủi ro persistence giữa các job, nhưng không ngăn workflow độc hại dùng token hoặc quyền mạng trong chính job hiện tại. Ranh giới bảo mật chính vẫn là repository access, workflow policy, token permission và network policy.

### Quan sát ngân sách và năng lực

Dashboard vận hành nên có ít nhất:

- số job, execution minutes và spend theo runner SKU/repository;
- queue-to-assigned median và p95;
- execution duration median và p95;
- maximum concurrency đã cấu hình so với peak active jobs;
- tỷ lệ failure, cancellation và rerun;
- custom image storage và số version giữ lại;
- thay đổi runner group, static IP và VNET configuration.

Thiết lập budget và cảnh báo trước khi mở quyền cho nhiều repository. Khi tăng maximum concurrency, ước lượng **burn rate cực đại** bằng tổng `maximum concurrent jobs × per-minute rate` của các pool có thể chạy cùng lúc. Đây là kịch bản trần, không phải dự báo usage trung bình.

## Best practices

- Đặt tên runner ổn định, có quy ước và coi label như interface được version hóa.
- Dùng runner group để biểu diễn trust boundary; không chỉ dùng nó như thư mục phân loại.
- Chọn machine size từ benchmark workload thật, rồi giữ headroom hợp lý cho peak RAM và disk.
- Pin OS/image cho pipeline nhạy cảm; thử image mới trên canary trước khi rollout.
- Dùng cache đúng key, chia test hợp lý và giảm setup time trước khi mua thêm CPU.
- Tách pool CI không đặc quyền khỏi pool deployment nối mạng private.
- Dùng static IP chỉ cho private repository được kiểm soát; dùng VNET khi cần private route và network policy đầy đủ.
- Giới hạn maximum concurrency theo nhu cầu và ngân sách, rồi điều chỉnh bằng số liệu queue p95.
- Đặt timeout cho job để giới hạn chi phí khi script treo.
- Lưu benchmark baseline và chạy lại sau thay đổi image, toolchain hoặc machine size.
- Kiểm tra bảng specification, availability, limits và pricing chính thức trong mỗi lần architecture review.
- Xóa pool, custom image version và quyền truy cập không còn sử dụng; việc cấu hình không chạy có thể không tốn compute nhưng vẫn tăng bề mặt quản trị và có thể tốn storage.

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| Job ở trạng thái queued lâu | Sai label/group; repository chưa được cấp quyền; pool đạt maximum concurrency; cold provisioning; account đạt concurrency limit | Copy label từ **Actions → Runners**; kiểm tra group access; xem active jobs; đối chiếu [Actions limits](https://docs.github.com/en/actions/reference/limits); chỉ tăng capacity sau khi xác định đúng nút thắt |
| Job không thấy larger runner | Runner ở enterprise group chưa cấp organization/repository; runner bị xóa hoặc đổi tên | Kiểm tra quyền ở cả enterprise và organization; xem danh sách runner mà repository truy cập được; cập nhật `runs-on` sau đổi tên |
| Job không bắt đầu dù còn slot | Thiếu payment method; Actions budget bằng 0 hoặc đã chạm budget; fair-use throttling | Kiểm tra Billing & licensing, budgets và email cảnh báo; chờ thời gian kích hoạt sau khi cập nhật thanh toán; liên hệ GitHub Support nếu cần |
| Job chạy trên pool không mong muốn | Chỉ định group quá rộng hoặc variable label sai | Kết hợp `group` và `labels`; log `runner.name`, `runner.os`, `runner.arch`; giới hạn repository access |
| Kết nối allowlist thất bại | Pool vẫn dùng IP động; allowlist thiếu một phần dải; dải tĩnh đã thay đổi sau thời gian không dùng | Xác nhận static IP trong runner settings; đồng bộ toàn bộ range; chạy kiểm tra egress; đối chiếu networking reference |
| VNET runner không được tạo | Size, architecture hoặc region không hỗ trợ; subnet thiếu IP; network configuration gắn sai group | Kiểm tra matrix/region chính thức; tính subnet cho peak concurrency cộng buffer; xác nhận runner group và Azure network settings |
| VNET job không tải action hoặc artifact | NSG, UDR, firewall, proxy hoặc DNS chặn endpoint GitHub/Azure Storage | Cho phép các domain tại [Communication requirements](https://docs.github.com/en/actions/reference/runners/larger-runners#communication-requirements-for-larger-runners); kiểm tra CNAME, DNS và outbound route |
| Azure Storage trả 403 dù đã allowlist public IP | Traffic cùng Azure region có thể dùng private Azure IP thay vì public range | Dùng Azure VNET hoặc làm theo hướng dẫn static IP/service endpoint trong [Managing larger runners](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/manage-larger-runners#azure-storage-firewall-considerations) |
| Larger runner không nhanh hơn | Workload đơn luồng, chờ mạng, cache miss, external service chậm hoặc phase tuần tự chiếm đa số | Profile từng phase; kiểm tra CPU/RAM/I/O; sửa cache và dependency; giảm size nếu benchmark không chứng minh lợi ích |
| Job hết đĩa hoặc RAM | Chọn size không đủ; Docker layer và artifact không được dọn; chạy quá nhiều process | Log `free` và `df`; dọn file tạm; giảm parallelism trong job hoặc tăng size dựa trên peak đã đo |
| arm64 action hoặc binary lỗi | Dependency/community action không phát hành arm64 | Kiểm tra release manifest; build binary tương ứng; thay action hoặc dùng x64 runner |
| macOS cần IP tĩnh VNET hoặc nested virtualization | Các khả năng này không được macOS larger runners hỗ trợ | Thiết kế lại kết nối, dùng dịch vụ trung gian an toàn hoặc đánh giá self-hosted macOS |
| Chi phí tăng đột biến | Maximum concurrency quá cao; matrix mở rộng; workflow loop; rerun; custom image giữ nhiều version | Tạm dừng workflow/pool; kiểm tra usage theo SKU; đặt budget; giới hạn `max-parallel`; thêm timeout và retention policy |
| Custom image không xuất hiện | Platform khác; image tạo ở scope khác; policy chặn; image chưa hoàn tất hoặc size đích quá nhỏ | Chọn cùng platform và organization/enterprise scope; kiểm tra policy, image status/version và yêu cầu storage size |

## Tài liệu tham khảo

- [Larger runners reference](https://docs.github.com/en/actions/reference/runners/larger-runners) — machine size, image, macOS limitations, networking và troubleshooting hiện hành.
- [Managing larger runners](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/manage-larger-runners) — tạo runner, chỉnh size/image, autoscaling và static IP.
- [Running jobs on larger runners](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/use-larger-runners) — label, runner group và cú pháp `runs-on`.
- [Controlling access to larger runners](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/control-access) — repository access và network configuration.
- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — standard runner, filesystem, IP và quyền quản trị.
- [Azure private networking for GitHub-hosted runners](https://docs.github.com/en/organizations/managing-organization-settings/about-azure-private-networking-for-github-hosted-runners-in-your-organization) — kiến trúc VNET, size và region hỗ trợ.
- [Actions limits](https://docs.github.com/en/actions/reference/limits) — concurrency, execution, matrix và VNET subnet guidance.
- [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) — SKU và đơn giá hiện hành.
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) — included usage, storage, custom image và budgets.
- [Using custom images](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/use-custom-images) — tạo, version, cài đặt và bảo vệ custom image.

## Trang liên quan

<Cards>
  <Card title="Labels và runner groups" href="/docs/runners/03-labels-va-runner-groups" description="Thiết kế nhãn, nhóm và chính sách định tuyến job." />
  <Card title="GitHub-hosted runners" href="/docs/runners/01-github-hosted-runners" description="Hiểu standard runner, image và tài nguyên mặc định." />
  <Card title="Self-hosted runners" href="/docs/runners/02-self-hosted-runners" description="So sánh với mô hình runner do tổ chức tự vận hành." />
  <Card title="Autoscaling với ARC" href="/docs/runners/05-autoscaling-arc" description="Tự động mở rộng self-hosted runners trên Kubernetes." />
</Cards>
