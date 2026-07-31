---
title: "GitHub-hosted runners"
description: "Hiểu vòng đời, image, tài nguyên, mạng, giới hạn và cách chọn GitHub-hosted runner cho workflow ổn định."
---

<Callout type="info" title="Phạm vi">
  Trang này tập trung vào **standard GitHub-hosted runners** do GitHub cấp phát và quản lý. Larger runners cũng do GitHub quản lý nhưng có thêm tài nguyên, static IP và private networking; chúng được giới thiệu ở trang riêng cuối bài.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
  - [Khi nào nên dùng](#khi-nào-nên-dùng)
- [Vòng đời môi trường thực thi](#vòng-đời-môi-trường-thực-thi)
  - [Môi trường sạch theo từng job](#môi-trường-sạch-theo-từng-job)
  - [Phạm vi dữ liệu giữa step và job](#phạm-vi-dữ-liệu-giữa-step-và-job)
- [Chọn runner bằng runs-on](#chọn-runner-bằng-runs-on)
  - [Nhãn và image phổ biến](#nhãn-và-image-phổ-biến)
  - [Chọn latest hay phiên bản hệ điều hành](#chọn-latest-hay-phiên-bản-hệ-điều-hành)
  - [Chạy trên nhiều hệ điều hành](#chạy-trên-nhiều-hệ-điều-hành)
- [Phần cứng và software image](#phần-cứng-và-software-image)
  - [Thông số phần cứng](#thông-số-phần-cứng)
  - [Phần mềm cài sẵn và cách kiểm tra](#phần-mềm-cài-sẵn-và-cách-kiểm-tra)
- [Networking và tài nguyên private](#networking-và-tài-nguyên-private)
  - [Internet công cộng và dải IP](#internet-công-cộng-và-dải-ip)
  - [Kết nối mạng riêng](#kết-nối-mạng-riêng)
- [Quyền giới hạn và chi phí](#quyền-giới-hạn-và-chi-phí)
  - [Quyền hệ điều hành và token](#quyền-hệ-điều-hành-và-token)
  - [Các giới hạn cần thiết kế quanh](#các-giới-hạn-cần-thiết-kế-quanh)
- [Bài thực hành kiểm chứng runner](#bài-thực-hành-kiểm-chứng-runner)
  - [Workflow hoàn chỉnh](#workflow-hoàn-chỉnh)
  - [Cách chạy và kết quả mong đợi](#cách-chạy-và-kết-quả-mong-đợi)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)
- [Học tiếp](#học-tiếp)

## Tổng quan

**Runner** là máy thực thi một job của GitHub Actions. Với GitHub-hosted runner, GitHub chịu trách nhiệm cấp máy, cài runner application, cập nhật hệ điều hành và chuẩn bị một tập công cụ phổ biến. Workflow chỉ cần chọn môi trường qua `jobs.<job_id>.runs-on`.

Ví dụ sau yêu cầu một runner Ubuntu do GitHub quản lý:

```yaml
jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - run: echo "Job đang chạy trên GitHub-hosted runner"
```

Không cần đăng ký máy hoặc vá hệ điều hành. Đổi lại, workflow phải chấp nhận tài nguyên hữu hạn, software image được cập nhật định kỳ và địa chỉ IP outbound không cố định trên standard runner.

### Khi nào nên dùng

GitHub-hosted runner là lựa chọn mặc định tốt khi:

- cần khởi động CI nhanh mà không vận hành hạ tầng runner;
- workload có thể chạy trên image Ubuntu, Windows hoặc macOS tiêu chuẩn;
- mỗi job có thể hoàn tất trong giới hạn thời gian và dung lượng của GitHub;
- dịch vụ phụ thuộc truy cập được từ Internet, qua OIDC/API gateway hoặc một cơ chế private networking được hỗ trợ;
- muốn cô lập mỗi job trong môi trường mới thay vì tái sử dụng một máy lâu dài.

Cân nhắc **larger runner** khi cần nhiều CPU, RAM, disk, GPU, static IP hoặc Azure private networking. Cân nhắc **self-hosted runner** khi cần phần cứng đặc biệt, kiểm soát mạng sâu hoặc phần mềm không phù hợp để cài lại trong mỗi job. Hai lựa chọn này tăng khả năng kiểm soát nhưng cũng tăng chi phí hoặc trách nhiệm vận hành.

## Vòng đời môi trường thực thi

### Môi trường sạch theo từng job

Với standard Linux, Windows và macOS runner, mỗi job nhận một **virtual machine (VM)** mới. VM là một máy tính được ảo hóa và cô lập khỏi máy vật lý bên dưới. GitHub thực hiện vòng đời cơ bản như sau:

```text
Workflow tạo job
       │
       ▼
GitHub xếp hàng và tìm runner phù hợp với runs-on
       │
       ▼
Cấp VM mới từ software image đã chọn
       │
       ▼
Chạy toàn bộ step của một job trên cùng VM
       │
       ▼
Thu log, output, cache hoặc artifact đã upload
       │
       ▼
Hủy VM sau khi job kết thúc
```

Một job khác, kể cả job kế tiếp trong cùng workflow, nhận một VM khác. File, process nền và package cài thủ công ở job trước không tự xuất hiện ở job sau.

Ngoại lệ đáng chú ý là `ubuntu-slim`. Nhãn này cấp một **container mới trên VM dùng chung**, không phải một VM đầy đủ. Container chạy ở chế độ unprivileged, có tập công cụ tối thiểu và phù hợp với automation nhẹ. Các thao tác như mount filesystem, Docker-in-Docker hoặc truy cập tính năng kernel mức thấp không được hỗ trợ.

<Callout type="warn" title="Sạch không có nghĩa là action nào cũng an toàn">
  Tính tạm thời giúp ngăn thay đổi tồn tại sang job tương lai. Tuy nhiên, mọi action và lệnh trong **cùng job** vẫn có thể đọc file, biến môi trường, token và secret mà job đó được cấp. Chỉ chạy mã tin cậy với đặc quyền tối thiểu.
</Callout>

### Phạm vi dữ liệu giữa step và job

Các step trong cùng job dùng chung filesystem và process environment của VM. Ví dụ, step thứ hai có thể đọc file mà step thứ nhất ghi vào `GITHUB_WORKSPACE` hoặc `RUNNER_TEMP`.

Ranh giới thay đổi khi chuyển sang job khác:

| Dữ liệu | Trong cùng job | Sang job khác | Cách truyền đúng |
|---|---|---|---|
| File trong `GITHUB_WORKSPACE` | Có | Không | Upload/download artifact nếu file là đầu ra cần giữ |
| Dependency đã tải | Có | Không | Dùng dependency cache để tăng tốc lần chạy sau |
| Giá trị nhỏ | Qua environment file hoặc step output | Không tự động | Khai báo job output và đọc qua `needs` |
| Source repository | Chỉ có sau khi checkout | Không tự động | Checkout lại trong từng job cần source |
| Process hoặc service nền | Có thể dùng ở step sau | Không | Khởi tạo service trong từng job cần nó |

`GITHUB_WORKSPACE`, `RUNNER_TEMP` và `RUNNER_TOOL_CACHE` là các đường dẫn runtime. Không hard-code đường dẫn vật lý vì GitHub không cam kết chúng cố định. Dùng biến môi trường hoặc `runner.workspace`, `runner.temp` và `runner.tool_cache` context.

<Callout type="idea" title="Phân biệt cache và artifact">
  Cache dành cho dữ liệu **có thể tái tạo**, chẳng hạn package npm hoặc Gradle. Artifact dành cho đầu ra cần xem, tải hoặc chuyển giữa job, chẳng hạn binary và báo cáo kiểm thử. Không xem cache là kho lưu trữ bền vững.
</Callout>

## Chọn runner bằng runs-on

`runs-on` là khóa định tuyến job. Với standard GitHub-hosted runner, giá trị thường là một nhãn image duy nhất:

```yaml
jobs:
  linux-test:
    runs-on: ubuntu-24.04

  windows-test:
    runs-on: windows-2025

  macos-test:
    runs-on: macos-15
```

`runs-on` cũng nhận expression. Mẫu phổ biến nhất là lấy nhãn từ matrix:

```yaml
runs-on: ${{ matrix.os }}
```

Dạng mảng như `[self-hosted, linux, x64]` có nghĩa runner phải khớp **tất cả** giá trị. Dạng này chủ yếu dùng với self-hosted runner. Runner groups cũng chỉ chứa self-hosted hoặc larger runners; chúng không phải cơ chế chọn standard GitHub-hosted runner.

### Nhãn và image phổ biến

**Software image** là snapshot hệ điều hành cùng tập phần mềm đã được GitHub chuẩn bị. Nhãn trong `runs-on` chọn image; nhãn không phải tên của một VM tồn tại lâu dài.

Các họ nhãn thường gặp trong năm 2026 được tóm tắt dưới đây. Danh sách có thể thay đổi khi image mới vào preview, GA hoặc bị deprecated, vì vậy hãy đối chiếu [bảng runner chính thức](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#supported-runners-and-hardware-resources) trước khi chuẩn hóa cho tổ chức.

| Nhu cầu | Nhãn tiêu biểu | Kiến trúc | Lưu ý |
|---|---|---|---|
| Linux x64 ổn định | `ubuntu-latest`, `ubuntu-24.04`, `ubuntu-22.04` | x64 | Phù hợp phần lớn CI và container job |
| Linux ARM | `ubuntu-24.04-arm`, `ubuntu-22.04-arm` | arm64 | Dùng để kiểm thử hoặc build native ARM |
| Automation Linux nhẹ | `ubuntu-slim` | x64 | Container 1 CPU, ít tool, unprivileged, timeout ngắn |
| Windows x64 | `windows-latest`, `windows-2025`, `windows-2022` | x64 | Dùng cho PowerShell, .NET Framework hoặc Visual Studio toolchain |
| Windows ARM | `windows-11-arm` | arm64 | Kiểm tra action và dependency có bản ARM trước |
| macOS | `macos-latest`, các nhãn version và biến thể Intel | arm64 hoặc Intel tùy nhãn | Cần cho Xcode, build và test hệ sinh thái Apple |

Không suy luận kiến trúc chỉ từ chữ `latest`. Hãy chọn nhãn kiến trúc rõ ràng khi binary native phụ thuộc x64/arm64, rồi xác nhận bằng `${{ runner.arch }}` trong log. Trên macOS arm64, nested virtualization không được hỗ trợ. Một số community action cũng chưa phát hành binary arm64.

Beta và deprecated image được cung cấp theo trạng thái hiện có và không có cùng cam kết hỗ trợ như image GA. Không dùng preview image làm đường chạy production duy nhất nếu chưa có nhánh fallback.

### Chọn latest hay phiên bản hệ điều hành

`ubuntu-latest` có nghĩa là image hệ điều hành ổn định mới nhất **mà GitHub đang cung cấp**. Nó không nhất thiết là bản mới nhất từ nhà phát hành Ubuntu. Tương tự với Windows và macOS.

Hai chiến lược có trade-off rõ ràng:

| Chiến lược | Ưu điểm | Rủi ro | Phù hợp |
|---|---|---|---|
| `*-latest` | Tự nhận hệ điều hành GA mới; giảm việc đổi nhãn thủ công | Có migration sang OS mới; tool mặc định thay đổi | CI muốn phát hiện sớm vấn đề tương thích |
| Nhãn version như `ubuntu-24.04` | Kiểm soát major OS; migration có chủ đích | Vẫn nhận cập nhật image hàng tuần; phải theo dõi deprecation | Build/release cần ổn định hơn |

Nhãn version **không đóng băng toàn bộ software image**. GitHub thường cập nhật image theo nhịp hàng tuần. Muốn tái lập tốt hơn, hãy cố định cả OS label lẫn phiên bản tool bằng action thiết lập tương ứng, lockfile hoặc container image có digest.

Ví dụ, pin `ubuntu-24.04` chỉ cố định dòng hệ điều hành. Phiên bản Node mặc định vẫn có thể đổi. Với ứng dụng Node.js, khai báo phiên bản Node rõ ràng qua `actions/setup-node` thay vì phụ thuộc bản có sẵn trên `PATH`.

### Chạy trên nhiều hệ điều hành

Matrix tạo một job riêng cho mỗi nhãn. Mỗi bản sao có VM và log độc lập:

```yaml
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-24.04, windows-2025, macos-15]
    runs-on: ${{ matrix.os }}
    steps:
      - name: Hiển thị môi trường
        shell: bash
        run: |
          echo "os=${{ runner.os }}"
          echo "arch=${{ runner.arch }}"
```

Bash có trên các image trong ví dụ, nhưng dùng shell chung không bảo đảm mọi lệnh hệ điều hành giống nhau. Với script dài, tách step theo `if: runner.os == 'Windows'` hoặc duy trì script đa nền tảng trong repository.

Matrix tăng coverage nhưng cũng tăng số job, thời gian tính phí và nhu cầu concurrency. Chỉ thêm hệ điều hành hoặc kiến trúc mà sản phẩm thực sự hỗ trợ.

## Phần cứng và software image

### Thông số phần cứng

Phải tách hai khái niệm:

- **Hardware resource** là CPU, RAM, SSD và kiến trúc VM/container.
- **Software image** là hệ điều hành cùng tool cài sẵn trên tài nguyên đó.

Cùng nhãn standard Linux hoặc Windows có thể nhận cấu hình khác nhau giữa public repository và private repository. Theo [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), cấu hình standard tại thời điểm cập nhật năm 2026 là:

| Loại standard runner | Public repository | Private repository | SSD được công bố |
|---|---:|---:|---:|
| Linux hoặc Windows x64/arm64 thông thường | 4 CPU, 16 GB RAM | 2 CPU, 8 GB RAM | 14 GB |
| macOS Intel | 4 CPU, 14 GB RAM | 4 CPU, 14 GB RAM | 14 GB |
| macOS arm64 | 3 CPU, 7 GB RAM | 3 CPU, 7 GB RAM | 14 GB |
| `ubuntu-slim` | 1 CPU, 5 GB RAM | 1 CPU, 5 GB RAM | 14 GB |

Các số này là thông số dịch vụ, không phải hằng số để chép vào policy lâu dài. GitHub có thể thêm nhãn hoặc thay đổi cấu hình. Hãy đặt link nguồn chính thức cạnh runbook capacity và đo tại runtime khi điều tra hiệu năng.

Dung lượng trống thực tế nhỏ hơn dung lượng SSD công bố vì hệ điều hành và tool cài sẵn đã chiếm chỗ. Lệnh `df -h` trên Linux/macOS hoặc `Get-Volume` trên Windows cho biết dung lượng tại đúng thời điểm job chạy.

Nếu build thường xuyên hết RAM, disk hoặc kéo dài vì thiếu CPU, đừng tối ưu bằng giả định. Ghi nhận CPU, peak memory, disk và thời gian của job trước. Sau đó tách workload, giảm dữ liệu trung gian hoặc đánh giá larger runner.

### Phần mềm cài sẵn và cách kiểm tra

Repository [`actions/runner-images`](https://github.com/actions/runner-images) là nguồn chính thức cho image definition, danh sách phần mềm, thông báo migration và release note. Mỗi image có một file `*-Readme.md` liệt kê tool và version hiện có. Image thường được cập nhật hàng tuần.

Có bốn cách kiểm tra đáng tin cậy:

1. Mở job log và mở rộng step **Set up job**. Phần này hiển thị runner image, version và liên kết đến danh sách included software của lần chạy đó.
2. Mở README của image từ bảng **Available Images** trong `actions/runner-images`.
3. Chạy lệnh kiểm tra ngay trong job, ví dụ `node --version`, `python3 --version`, `docker version` hoặc `xcodebuild -version`.
4. Với yêu cầu supply chain, tải **SBOM** từ assets của image release. SBOM, viết tắt của Software Bill of Materials, là danh mục thành phần phần mềm có trong image.

Đoạn Bash sau ghi lại thông tin hữu ích mà không thất bại nếu một biến image không tồn tại:

```bash
set -euo pipefail

echo "runner.os=${{ runner.os }}"
echo "runner.arch=${{ runner.arch }}"
echo "workspace=$GITHUB_WORKSPACE"
uname -a

env | sort | grep -E '^Image(OS|Version)=' || true

git --version
node --version
python3 --version
df -h "$GITHUB_WORKSPACE"
```

`ImageOS` và `ImageVersion` hữu ích khi hiện diện, nhưng workflow không nên phụ thuộc logic nghiệp vụ vào các biến triển khai này. Context `runner.os`, `runner.arch` và log **Set up job** là lựa chọn rõ ràng hơn để chẩn đoán.

<Callout type="warn" title="Không dựa vào tool tình cờ có sẵn">
  Included software giúp job khởi động nhanh, nhưng version có thể đổi khi image được cập nhật. Nếu version ảnh hưởng kết quả build, hãy cài hoặc chọn version rõ ràng và kiểm tra version trong log.
</Callout>

## Networking và tài nguyên private

### Internet công cộng và dải IP

GitHub-hosted runner có outbound access ra Internet theo mặc định. Job có thể tải dependency, gọi API hoặc đẩy artifact đến dịch vụ ngoài nếu firewall của dịch vụ đó cho phép.

Standard Ubuntu và Windows runners được host trên Azure; macOS runners dùng hạ tầng macOS cloud của GitHub. Địa chỉ IP public không cố định cho từng job. Endpoint `GET https://api.github.com/meta` trả về các dải hiện hành trong khóa `actions`; danh sách này được cập nhật mỗi tuần.

Có thể kiểm tra động bằng:

```bash
curl --fail --silent --show-error \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/meta \
  | jq '.actions'
```

GitHub không khuyến nghị dùng toàn bộ các dải này làm allowlist cho tài nguyên nội bộ vì danh sách lớn và thay đổi. Nếu đối tác yêu cầu một nguồn IP cố định, lựa chọn thực tế là larger runner có static IP hoặc self-hosted runner với egress do bạn kiểm soát.

Ngoài kết nối của script, runner còn cần truy cập các domain phục vụ tải action, log, artifact, cache, package và cập nhật runner. Danh sách domain có cả CNAME có thể thay đổi. Khi firewall chặn outbound, dùng mục [Communication requirements](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#communication-requirements-for-github-hosted-runners) làm nguồn thay vì sao chép một danh sách cũ vào tài liệu nội bộ.

### Kết nối mạng riêng

Một standard runner từ Internet không tự nhìn thấy database, registry hoặc secret manager trong private subnet. GitHub mô tả ba mẫu kết nối chính:

| Mẫu | Cách hoạt động | Khi phù hợp | Điểm cần bảo vệ |
|---|---|---|---|
| API gateway với OIDC | Workflow lấy OpenID Connect token ngắn hạn; gateway xác minh claim trước khi cho gọi API | Chỉ cần một số API có phạm vi rõ ràng | Ràng buộc `repository`, `ref`, `environment` hoặc claim phù hợp; không cấp quyền rộng |
| WireGuard overlay | Job tạo tunnel WireGuard đến endpoint trong mạng riêng | Cần truy cập ở tầng mạng nhưng không muốn mở public service | Quản lý key ngắn hạn, route hẹp và teardown tunnel |
| Azure Virtual Network | GitHub-hosted larger runner được đưa vào Azure VNET | Tổ chức dùng Azure và cần network policy tập trung | Kích thước subnet, DNS, NSG, route và giới hạn feature |

**OIDC** là cơ chế phát token danh tính ngắn hạn cho job. Nó giúp đổi long-lived cloud secret thành credential tạm thời có điều kiện. OIDC không tự tạo đường mạng; API đích vẫn cần một endpoint mà runner tiếp cận được.

**WireGuard** là VPN nhẹ tạo encrypted tunnel. Mẫu này có thể kết nối runner tạm thời với một gateway trong mạng riêng, nhưng nhóm vận hành phải thiết kế route và thu hồi credential cẩn thận.

Không mở database trực tiếp ra Internet chỉ để CI truy cập. Hãy ưu tiên API hẹp có xác thực OIDC, larger runner với private networking hoặc self-hosted runner trong trust zone phù hợp.

## Quyền giới hạn và chi phí

### Quyền hệ điều hành và token

Trên Linux và macOS VM, user của job có `sudo` không cần mật khẩu. Trên Windows VM, job chạy với quyền administrator và User Account Control bị tắt. Vì VM là tạm thời, có thể cài package trong job. Tuy nhiên, cài nhiều package mỗi lần làm job chậm và tăng phụ thuộc vào package registry.

Quyền quản trị hệ điều hành không đồng nghĩa với quyền ghi repository. GitHub cấp một `GITHUB_TOKEN` riêng cho job; khả năng của token do khóa `permissions` và policy repository/organization quyết định.

Đặt quyền tối thiểu ở workflow hoặc job:

```yaml
permissions:
  contents: read
```

Một action có thể đọc token qua `github.token` dù workflow không truyền token thành input. Vì vậy, chỉ khai báo quyền thực sự cần. Job chỉ chạy test thường không cần `write`.

Với credential cloud, ưu tiên OIDC và token ngắn hạn. Không in secret ra log. Không checkout code không tin cậy trong workflow đặc quyền như `pull_request_target`, đặc biệt khi job có secret hoặc token ghi.

### Các giới hạn cần thiết kế quanh

Một số giới hạn hiện hành đáng đưa vào thiết kế:

- Mỗi job trên GitHub-hosted runner chạy tối đa **6 giờ**. Riêng `ubuntu-slim` có timeout dịch vụ **15 phút**.
- Số job đồng thời phụ thuộc GitHub plan và loại runner. Khi hết concurrency, job ở trạng thái queued thay vì được cấp VM ngay.
- Một matrix tạo tối đa **256 job** cho mỗi workflow run.
- Toàn bộ workflow run, gồm thời gian chạy, chờ và approval, có giới hạn **35 ngày**.
- Artifact storage, cache storage và included minutes phụ thuộc plan. Các giới hạn này tách biệt với SSD tạm của VM.
- Public repository được dùng standard GitHub-hosted runners miễn phí và không giới hạn phút theo tài liệu hiện hành. Private repository dùng quota phút của tài khoản rồi tính phí theo loại runner.
- GitHub làm tròn thời gian của từng job theo chính sách billing hiện hành. macOS và Windows có đơn giá khác Linux; luôn kiểm tra trang pricing trước khi ước tính.

Các giá trị có thể thay đổi. Dùng [Actions limits](https://docs.github.com/en/actions/reference/limits), [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) và trang usage của organization làm nguồn vận hành.

Đặt `timeout-minutes` thấp hơn giới hạn dịch vụ để job treo thất bại sớm:

```yaml
jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - run: ./scripts/test.sh
```

## Bài thực hành kiểm chứng runner

Bài thực hành này chứng minh ba tính chất: job đọc được thông tin runtime, các step trong một job dùng chung file, và job kế tiếp không nhận file tạm từ job trước.

### Workflow hoàn chỉnh

Tạo file `.github/workflows/inspect-hosted-runner.yml`:

```yaml
name: Inspect GitHub-hosted runner

on:
  workflow_dispatch:
  push:
    paths:
      - .github/workflows/inspect-hosted-runner.yml

permissions:
  contents: read

jobs:
  inspect:
    name: Inspect image and same-job state
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Print runner and image metadata
        shell: bash
        run: |
          set -euo pipefail

          echo "runner.os=${{ runner.os }}"
          echo "runner.arch=${{ runner.arch }}"
          echo "workspace=$GITHUB_WORKSPACE"
          echo "temp=$RUNNER_TEMP"

          uname -a
          lscpu | sed -n '1,12p'
          free -h
          df -h "$GITHUB_WORKSPACE"

          echo "Image metadata, when available:"
          env | sort | grep -E '^Image(OS|Version)=' || true

      - name: Inspect selected tools
        shell: bash
        run: |
          set -euo pipefail

          for tool in git node python3 docker; do
            printf '%-10s ' "$tool"
            "$tool" --version 2>&1 | head -n 1
          done

      - name: Create job-local marker
        shell: bash
        run: |
          set -euo pipefail
          printf 'created-by=%s\n' "${{ github.job }}" > "$RUNNER_TEMP/job-local-marker"

      - name: Verify a later step sees the marker
        shell: bash
        run: |
          set -euo pipefail
          test -f "$RUNNER_TEMP/job-local-marker"
          cat "$RUNNER_TEMP/job-local-marker"

  fresh-job:
    name: Verify the next job is clean
    needs: inspect
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - name: Confirm marker was not persisted
        shell: bash
        run: |
          set -euo pipefail

          if [[ -e "$RUNNER_TEMP/job-local-marker" ]]; then
            echo "Unexpected marker from another job" >&2
            exit 1
          fi

          echo "No marker found: this job received a fresh runner."
```

Workflow không checkout source vì không đọc file repository. Đây cũng là một kiểm chứng quan trọng: GitHub tạo workspace nhưng không tự tải source. Khi build code, thêm `actions/checkout` vào từng job cần repository và pin action theo policy supply chain của tổ chức.

### Cách chạy và kết quả mong đợi

1. Commit và push file workflow lên GitHub.
2. Mở **Actions → Inspect GitHub-hosted runner → Run workflow**, hoặc để event `push.paths` kích hoạt khi chính file thay đổi.
3. Mở job `Inspect image and same-job state`, sau đó xem step **Set up job** và `Print runner and image metadata`.
4. Xác nhận step tạo marker và step kế tiếp cùng đọc được `created-by=inspect`.
5. Mở job `Verify the next job is clean` và xác nhận log có `No marker found`.

Tiêu chí đạt:

- cả hai job đều thành công;
- log hiển thị `runner.os=Linux` và kiến trúc runtime;
- CPU, RAM, disk và version tool được ghi lại;
- file tồn tại giữa hai step trong job `inspect`;
- file không tồn tại trong `fresh-job`.

Muốn quan sát cập nhật image theo thời gian, lưu `ImageVersion` cùng URL workflow run vào hệ thống theo dõi. Không dùng giá trị này làm điều kiện pass/fail nếu GitHub không công bố nó như API ổn định.

## Best practices

1. **Chọn OS theo nhu cầu, không theo thói quen.** Dùng Ubuntu cho workload portable. Chỉ thêm Windows/macOS khi sản phẩm hoặc toolchain yêu cầu.
2. **Pin major OS cho đường release.** Ví dụ dùng `ubuntu-24.04`, rồi thử `ubuntu-latest` ở một job cảnh báo sớm. Nhãn OS version vẫn nhận update hàng tuần.
3. **Khai báo version tool.** Dùng setup action, lockfile hoặc container digest. In version quan trọng vào log để điều tra regression.
4. **Không truyền state qua filesystem giữa job.** Dùng job output cho metadata nhỏ, artifact cho file đầu ra và cache cho dependency tái tạo được.
5. **Đặt timeout có chủ đích.** `timeout-minutes` giúp dừng deadlock trước giới hạn sáu giờ và tiết kiệm phút.
6. **Giới hạn quyền.** Bắt đầu với `permissions: contents: read` hoặc `permissions: {}` rồi mở đúng scope tại job cần ghi.
7. **Pin third-party action bằng full commit SHA trong production.** Tag thuận tiện nhưng có thể bị di chuyển. Kết hợp Dependabot để cập nhật SHA có kiểm soát.
8. **Không allowlist toàn bộ IP standard runner nếu cần egress ổn định.** Chuyển sang larger runner có static IP, self-hosted runner hoặc API gateway xác thực OIDC.
9. **Theo dõi thay đổi image.** Subscribe release và issue có nhãn `Announcement` trong `actions/runner-images`. Thử migration trước ngày deprecated.
10. **Đo tài nguyên trước khi nâng cấp.** Ghi CPU, RAM, disk và duration. Chỉ chuyển larger runner khi bottleneck đã rõ.
11. **Tách code không tin cậy khỏi secret.** Không chạy untrusted pull request code trong job có quyền ghi, environment secret hoặc đường mạng nhạy cảm.
12. **Giữ workflow đa nền tảng thật sự đa nền tảng.** Đặt shell rõ ràng, tránh giả định path separator và kiểm thử cả kiến trúc khi phát hành native binary.

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| Job ở trạng thái queued lâu | Hết concurrency, nhãn preview chưa khả dụng hoặc plan/policy không cho dùng runner | Kiểm tra usage và Actions limits; đối chiếu nhãn trong bảng chính thức; xem GitHub Status |
| `No runner matching the specified labels` | Gõ sai nhãn, dùng nhãn larger/self-hosted như standard label hoặc image đã deprecated | Kiểm tra `runs-on`; mở GitHub-hosted runners reference và announcement migration |
| Tool hôm qua có nhưng hôm nay thiếu hoặc đổi version | Software image được cập nhật; workflow dựa vào tool mặc định | Xem **Set up job**, image release note và included software; khai báo version bằng setup action |
| Build hết disk dù SSD được công bố còn lớn | Image và tool đã chiếm disk; Docker layer, package cache hoặc artifact trung gian quá lớn | Chạy `df -h` hoặc `Get-Volume`; xóa dữ liệu không cần; tách job hoặc dùng larger runner |
| File tạo ở job trước không tồn tại | Mỗi job nhận môi trường mới | Upload artifact ở job sản xuất và download trong job tiêu thụ; dùng output cho giá trị nhỏ |
| Source repository trống | Runner không tự checkout source | Thêm `actions/checkout` vào từng job cần code và bảo đảm `contents: read` |
| `Permission denied` khi gọi GitHub API | `GITHUB_TOKEN` thiếu permission hoặc policy tổ chức chặn ghi | Khai báo scope tối thiểu tại job; kiểm tra **Settings → Actions → General**; không dùng `write-all` để chữa nhanh |
| API nội bộ timeout hoặc DNS không phân giải | Standard runner không có route private, firewall chặn hoặc DNS chỉ tồn tại trong VNET | Chọn OIDC gateway, WireGuard, Azure private networking/larger runner hoặc self-hosted runner |
| Đối tác chặn IP runner | Standard runner dùng dải IP động, allowlist đã cũ | Không pin IP quan sát được từ một job; dùng static IP của larger runner hoặc egress tự quản lý |
| Lệnh Bash lỗi trên Windows | Shell mặc định và cú pháp biến khác nhau | Đặt `shell` rõ ràng; dùng PowerShell trên Windows hoặc script đa nền tảng |
| ARM job báo `exec format error` | Action, binary hoặc container image chỉ có bản x64 | Chọn image multi-arch, build arm64, cập nhật action hoặc chạy nhãn x64 |
| `ubuntu-slim` không chạy Docker hay mount | Runner là container unprivileged với bộ tool tối thiểu | Chuyển sang standard Ubuntu VM hoặc larger runner; chỉ dùng slim cho automation nhẹ |
| Job bị hủy đúng mốc thời gian | Chạm timeout của job hoặc `timeout-minutes` | Chia nhỏ job, checkpoint bằng artifact, tối ưu workload; không thiết kế một job vượt giới hạn dịch vụ |
| macOS test cần nested virtualization | macOS arm64 runner không hỗ trợ nested virtualization | Đổi chiến lược test hoặc chọn hạ tầng phù hợp; không giả định Intel và arm64 có cùng capability |

Khi lỗi có vẻ đến từ hạ tầng, thu thập URL run, image version trong **Set up job**, runner OS/architecture, timestamp và step đầu tiên thất bại. Sau đó kiểm tra [GitHub Status](https://www.githubstatus.com/) và issue/release của `actions/runner-images` trước khi thay đổi workflow.

## Tài liệu tham khảo

- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — nhãn, hardware, quyền admin, IP, domain và filesystem.
- [Choosing the runner for a job](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job) — cú pháp và các dạng `runs-on`.
- [GitHub Actions runner images](https://github.com/actions/runner-images) — image hiện có, included software, release và announcement.
- [Runner image releases và SBOM](https://github.com/actions/runner-images/releases) — lịch sử image cụ thể và Software Bill of Materials.
- [Private networking with GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/private-networking) — OIDC gateway, WireGuard và Azure VNET.
- [REST API meta endpoint](https://docs.github.com/en/rest/meta/meta#get-github-meta-information) — cách lấy dải IP hiện hành từ khóa `actions`.
- [Actions limits](https://docs.github.com/en/actions/reference/limits) — timeout, concurrency, matrix và storage.
- [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) — đơn giá hiện hành theo loại runner.
- [Use GITHUB_TOKEN for authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token) — cấu hình `permissions` theo least privilege.
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) — secret, untrusted code và pin action dependency.

## Học tiếp

<Cards>
  <Card title="Self-hosted runners" href="/docs/runners/02-self-hosted-runners/" description="Đánh giá trách nhiệm cài đặt, cập nhật và cô lập runner trên hạ tầng của bạn." />
  <Card title="Labels và runner groups" href="/docs/runners/03-labels-va-runner-groups/" description="Thiết kế định tuyến và ranh giới truy cập cho runner pool được quản lý." />
  <Card title="Larger runners" href="/docs/runners/04-larger-runners/" description="Tìm hiểu tài nguyên lớn, static IP, private networking và autoscaling do GitHub quản lý." />
  <Card title="Bảo mật runner" href="/docs/runners/06-runner-hardening/" description="Giảm quyền, bảo vệ secret và cô lập workload không tin cậy." />
</Cards>
