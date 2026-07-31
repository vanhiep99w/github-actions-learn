---
title: "Labels và runner groups"
description: "Thiết kế nhãn, nhóm runner và policy truy cập để định tuyến job GitHub Actions đúng năng lực và đúng phạm vi tin cậy."
---

<Callout type="info" title="Mục tiêu">
  Sau bài này, bạn có thể phân biệt **label** với **runner group**, viết đúng `runs-on`, thiết kế taxonomy nhãn và giới hạn repository hoặc workflow được phép dùng từng nhóm runner.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
- [Labels mô tả năng lực của runner](#labels-mô-tả-năng-lực-của-runner)
  - [Labels mặc định](#labels-mặc-định)
  - [Custom labels](#custom-labels)
  - [Đăng ký không có labels mặc định](#đăng-ký-không-có-labels-mặc-định)
- [Cơ chế khớp của runs-on](#cơ-chế-khớp-của-runs-on)
  - [Mảng labels dùng phép AND](#mảng-labels-dùng-phép-and)
  - [Định tuyến bằng group và labels](#định-tuyến-bằng-group-và-labels)
  - [Không có cơ chế ưu tiên theo thứ tự labels](#không-có-cơ-chế-ưu-tiên-theo-thứ-tự-labels)
- [Runner groups tạo ranh giới truy cập](#runner-groups-tạo-ranh-giới-truy-cập)
  - [Runner groups ở organization](#runner-groups-ở-organization)
  - [Runner groups ở enterprise](#runner-groups-ở-enterprise)
  - [Policy repository và workflow access](#policy-repository-và-workflow-access)
- [Phạm vi và thứ tự áp dụng](#phạm-vi-và-thứ-tự-áp-dụng)
  - [Phạm vi hiệu lực](#phạm-vi-hiệu-lực)
  - [Trùng tên group giữa organization và enterprise](#trùng-tên-group-giữa-organization-và-enterprise)
  - [Vòng đời định tuyến job](#vòng-đời-định-tuyến-job)
- [Lưu ý với Actions Runner Controller](#lưu-ý-với-actions-runner-controller)
- [Thiết kế taxonomy labels](#thiết-kế-taxonomy-labels)
  - [Một chiều thông tin cho mỗi label](#một-chiều-thông-tin-cho-mỗi-label)
  - [Dùng group cho trust boundary](#dùng-group-cho-trust-boundary)
  - [Ngăn định tuyến nhầm](#ngăn-định-tuyến-nhầm)
- [Bài thực hành](#bài-thực-hành)
  - [Yêu cầu chuẩn bị](#yêu-cầu-chuẩn-bị)
  - [Tạo group và đăng ký runner](#tạo-group-và-đăng-ký-runner)
  - [Tạo workflow kiểm chứng](#tạo-workflow-kiểm-chứng)
  - [Kiểm tra cả trường hợp không khớp](#kiểm-tra-cả-trường-hợp-không-khớp)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)
- [Các trang runners liên quan](#các-trang-runners-liên-quan)

## Tổng quan

GitHub Actions cần trả lời hai câu hỏi trước khi giao một job cho runner:

1. **Runner có đủ năng lực không?** Labels mô tả hệ điều hành, kiến trúc hoặc khả năng như GPU, Docker và kết nối mạng riêng.
2. **Workflow có được phép dùng runner không?** Runner groups cùng policy truy cập tạo ranh giới giữa repository, organization và enterprise.

Ví dụ, job triển khai production có thể yêu cầu group `rg-prod-deploy` **và** các labels `linux`, `x64`, `net-private`. Chỉ runner nằm trong group đó, có đủ mọi label và được policy cho phép mới nhận job.

```text
Repository/workflow được policy cho phép
                  │
                  ▼
       Group khớp: rg-prod-deploy
                  │
                  ▼
 Labels đều khớp: linux + x64 + net-private
                  │
                  ▼
           Runner online và idle
```

<Callout type="warn" title="Labels không phải quyền truy cập">
  Label chỉ là metadata phục vụ định tuyến. Gán label `prod` không tự bảo vệ runner production. Hãy dùng runner group, repository/workflow access policy và cơ chế cô lập hạ tầng để tạo ranh giới bảo mật.
</Callout>

## Labels mô tả năng lực của runner

### Labels mặc định

Khi đăng ký self-hosted runner theo cách thông thường, GitHub tự gán ba nhóm label:

| Chiều thông tin | Labels có thể gặp | Ý nghĩa |
|---|---|---|
| Loại runner | `self-hosted` | Runner do bạn quản lý |
| Hệ điều hành | `linux`, `windows`, `macOS` | Hệ điều hành được phát hiện khi cấu hình |
| Kiến trúc | `x64`, `ARM`, `ARM64` | Kiến trúc phần cứng được phát hiện |

Ví dụ sau chỉ chọn self-hosted runner Linux chạy trên ARM64:

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, ARM64]
    steps:
      - run: uname -a
```

Tên label **không phân biệt chữ hoa và chữ thường**. Dù vậy, nên giữ cách viết nhất quán để workflow và tài liệu dễ tìm kiếm.

### Custom labels

Custom label mô tả đặc điểm mà labels mặc định không thể hiện, chẳng hạn:

- `cap-gpu-nvidia`: có GPU NVIDIA và driver phù hợp;
- `cap-docker`: Docker daemon đã sẵn sàng;
- `net-private`: truy cập được mạng nội bộ;
- `toolchain-android`: có Android SDK theo baseline của đội nền tảng.

Có thể gán labels khi đăng ký runner mới bằng danh sách phân tách bởi dấu phẩy:

```bash
./config.sh \
  --url https://github.com/ACME \
  --token "$RUNNER_TOKEN" \
  --labels cap-docker,net-private
```

Với runner đã đăng ký, hãy gán hoặc gỡ label trong **Settings → Actions → Runners**, hoặc dùng [REST API cho self-hosted runners](https://docs.github.com/en/rest/actions/self-hosted-runners). Script `config.sh` không dùng để thêm label cho một runner đang tồn tại. Khi thay thế runner, bạn cũng phải gán lại custom labels.

Custom label không còn được gán cho runner nào sẽ tự bị xóa trong vòng 24 giờ. GitHub hiện không cho xóa thủ công một custom label đang ở trạng thái không sử dụng.

<Callout type="warn" title="GitHub không xác minh ý nghĩa custom label">
  Khi bạn truyền cả tên giống label mặc định, chẳng hạn `linux` hoặc `x64`, qua `--labels`, GitHub chấp nhận giá trị đó mà không xác minh máy thật sự dùng hệ điều hành hoặc kiến trúc tương ứng. Vì vậy, quy trình cấp phát runner phải tự kiểm tra năng lực trước khi gán label.
</Callout>

### Đăng ký không có labels mặc định

Cờ `--no-default-labels` ngăn GitHub gán `self-hosted`, label hệ điều hành và label kiến trúc khi tạo runner:

```bash
./config.sh \
  --url https://github.com/ACME \
  --token "$RUNNER_TOKEN" \
  --no-default-labels \
  --labels pool-ci-linux-x64,cap-docker
```

Workflow phải nhắm đến labels thực sự có trên runner:

```yaml
jobs:
  test:
    runs-on: [pool-ci-linux-x64, cap-docker]
    steps:
      - run: docker version
```

Không dùng `[self-hosted, linux, x64, ...]` cho runner này nếu bạn chưa chủ động gán lại các labels đó. `--no-default-labels` hữu ích khi muốn taxonomy hoàn toàn do đội nền tảng quản lý, nhưng nó cũng làm workflow kém quen thuộc hơn với người mới.

## Cơ chế khớp của runs-on

### Mảng labels dùng phép AND

Khi `runs-on` là một mảng, runner phải có **tất cả** giá trị trong mảng. Đây là phép AND, không phải OR.

```yaml
jobs:
  train_model:
    runs-on: [self-hosted, linux, x64, cap-gpu-nvidia]
    steps:
      - run: nvidia-smi
```

Một runner có `self-hosted`, `linux` và `x64` nhưng thiếu `cap-gpu-nvidia` sẽ không đủ điều kiện. Một runner có thêm nhiều label khác vẫn có thể nhận job, miễn là có đủ bốn label được yêu cầu.

Nếu muốn chạy cùng job trên nhiều loại máy, dùng `strategy.matrix` thay vì hiểu mảng `runs-on` là OR:

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [linux, windows]
    runs-on: [self-hosted, "${{ matrix.os }}", x64]
    steps:
      - run: echo "Runner OS is ${{ runner.os }}"
```

### Định tuyến bằng group và labels

Dùng mapping syntax với hai khóa `group` và `labels` khi cần đồng thời giới hạn phạm vi truy cập và năng lực máy:

```yaml
jobs:
  deploy:
    runs-on:
      group: rg-prod-deploy
      labels: [self-hosted, linux, x64, net-private]
    steps:
      - run: ./scripts/deploy.sh
```

Runner đủ điều kiện khi thỏa **cả hai** điều kiện:

- là thành viên của `rg-prod-deploy`;
- có toàn bộ labels `self-hosted`, `linux`, `x64` và `net-private`.

Nếu chỉ cần group, vẫn dùng mapping syntax:

```yaml
jobs:
  build:
    runs-on:
      group: rg-build
    steps:
      - run: make build
```

### Không có cơ chế ưu tiên theo thứ tự labels

Thứ tự `self-hosted`, `linux`, `x64` trong mảng không tạo trọng số. GitHub khuyến nghị đặt `self-hosted` đầu tiên cho self-hosted runner thông thường, nhưng việc đó không khiến runner này được ưu tiên hơn runner khác.

Nếu có nhiều runner cùng khớp, GitHub giao job cho một runner online và idle phù hợp. Không nên thiết kế hệ thống dựa trên giả định một tên máy cụ thể luôn thắng. Muốn tách pool, hãy dùng group hoặc một label phân biệt rõ ràng.

## Runner groups tạo ranh giới truy cập

Runner group gom self-hosted runners hoặc larger runners thành một pool có policy chung. Repository-level runner không được tổ chức bằng runner group; group được quản lý ở organization hoặc enterprise.

### Runner groups ở organization

Mỗi organization có một default runner group. Runner được đăng ký ở cấp organization mà không chỉ định `--runnergroup` sẽ vào default group. Trên gói hỗ trợ tính năng này, organization owner hoặc vai trò tùy chỉnh có quyền quản lý runner có thể tạo thêm group.

Khi đăng ký runner mới, có thể đưa thẳng runner vào group đã tồn tại:

```bash
./config.sh \
  --url https://github.com/ACME \
  --token "$RUNNER_TOKEN" \
  --runnergroup rg-build-private \
  --labels cap-docker
```

Lệnh thất bại nếu `rg-build-private` chưa tồn tại. Với runner hiện có, có thể chuyển group tại **Organization Settings → Actions → Runners → chọn runner → Runner group**.

### Runner groups ở enterprise

Enterprise runner group có thể được chia sẻ cho tất cả hoặc một danh sách organization trong enterprise. Enterprise owner đặt policy organization access và có thể giới hạn workflow được dùng group.

Sau khi group được chia sẻ xuống organization, quản trị organization có thể thu hẹp thêm repository hoặc workflow access. Họ không thể nới lỏng một giới hạn đã được enterprise áp đặt.

Nói ngắn gọn:

```text
Enterprise policy
       AND
Organization policy
       AND
Workflow runs-on
       =
Runner đủ điều kiện
```

### Policy repository và workflow access

Khi tạo organization runner group, cần chọn repository access policy:

- **All repositories**: mọi repository thuộc organization được phép truy cập theo loại repository mà policy cho phép;
- **Selected repositories**: chỉ các repository được chọn mới thấy và dùng group.

Theo mặc định, chỉ private repositories được truy cập runner trong group, nhưng quản trị viên có thể thay đổi nếu policy cấp trên cho phép. GitHub khuyến nghị chỉ dùng self-hosted runners với private repositories vì code từ fork của public repository có thể tìm cách chạy mã không tin cậy trên máy runner.

Trên GitHub Enterprise Cloud, runner group còn có thể giới hạn theo workflow. Khi dùng **Selected workflows**, nhập đường dẫn đầy đủ và pin ref rõ ràng, ví dụ:

```text
ACME/platform-workflows/.github/workflows/deploy.yml@refs/heads/main
ACME/platform-workflows/.github/workflows/release.yml@refs/tags/v2
ACME/platform-workflows/.github/workflows/deploy.yml@d6dc6c96df4f32fa27b039f2084f576ed2c5c2a5
```

Chỉ jobs được định nghĩa trực tiếp trong workflow đã chọn mới có quyền truy cập group. Với reusable workflow, hãy allowlist đúng workflow chứa job cần runner, không chỉ workflow gọi nó.

<Callout type="idea" title="Mẫu policy an toàn cho production">
  Dùng enterprise hoặc organization group riêng cho production, chọn đúng repositories, rồi chỉ cho phép reusable deployment workflow đã pin bằng tag bất biến hoặc full commit SHA. Labels tiếp tục lọc năng lực máy, nhưng không thay thế policy này.
</Callout>

## Phạm vi và thứ tự áp dụng

### Phạm vi hiệu lực

Một runner chỉ có thể nhận job nếu nó hiện diện trong phạm vi mà repository được phép dùng:

| Cấp đăng ký | Phạm vi ban đầu | Cách thu hẹp |
|---|---|---|
| Repository | Một repository | Quyền và workflow của chính repository đó |
| Organization | Các repository trong organization | Organization runner group và repository/workflow access policy |
| Enterprise | Các organization trong enterprise | Enterprise organization/workflow policy, sau đó policy chi tiết ở organization |

Labels không mở rộng phạm vi. Ví dụ, repository `shop-api` không thể dùng enterprise runner chỉ vì workflow và runner cùng có label `net-private`; organization và repository vẫn phải được group policy cho phép.

Thứ tự kiểm tra có thể hiểu như sau:

1. Repository và workflow có quyền truy cập runner group.
2. Group trong `runs-on` khớp với group của runner.
3. Tất cả labels trong `runs-on` đều khớp.
4. Runner đang online và idle để nhận job.

### Trùng tên group giữa organization và enterprise

Tên group phải duy nhất ở cấp organization. Nếu organization group và enterprise group cũ cùng tên, workflow không thể định tuyến vì bị mơ hồ. Hãy đổi tên hoặc thêm prefix phạm vi được GitHub hỗ trợ:

```yaml
jobs:
  org_build:
    runs-on:
      group: org/my-group
      labels: [self-hosted, linux]

  enterprise_build:
    runs-on:
      group: ent/my-group
      labels: [self-hosted, linux]
```

Có thể dùng dạng đầy đủ `organization/my-group` và `enterprise/my-group` thay cho `org/` và `ent/`. Đây là cách phân giải phạm vi, không phải cơ chế ưu tiên một group hơn group kia.

### Vòng đời định tuyến job

Sau khi các điều kiện truy cập, group và labels khớp:

- nếu có runner online và idle, GitHub gán job cho runner đó;
- nếu runner không nhận job đã gán trong 60 giây, job được đưa lại vào hàng đợi để runner khác nhận;
- nếu chưa có runner phù hợp online và idle, job tiếp tục ở trạng thái queued;
- nếu queued quá 24 giờ, job thất bại.

Vì vậy, trạng thái queued không nhất thiết là lỗi YAML. Nó thường cho biết không có runner vừa **được phép truy cập**, vừa **khớp group/labels**, vừa **sẵn sàng**.

## Lưu ý với Actions Runner Controller

Một caveat cũ thường gặp là “Actions Runner Controller (ARC) không hỗ trợ nhiều labels”. Theo tài liệu GitHub hiện hành được kiểm tra trong năm 2026, hạn chế chung này **không còn áp dụng** cho runner scale sets: ARC cho phép gán nhiều labels và dùng mảng labels trong `runs-on`.

Tài liệu ARC hiện tại minh họa cấu hình như sau:

```yaml
runnerScaleSetLabels:
  - linux
  - gpu
  - private-network
```

Workflow tương ứng:

```yaml
jobs:
  train:
    runs-on: [linux, gpu, private-network]
    steps:
      - run: nvidia-smi
```

Tuy nhiên, tài liệu chọn runner hiện hành vẫn ghi rõ ARC không hỗ trợ label `self-hosted`. Với ARC, cách đơn giản và ít mơ hồ nhất là dùng tên runner scale set làm `runs-on`, hoặc dùng đúng tập labels đã cấu hình mà không tự động thêm `self-hosted`.

```yaml
jobs:
  test:
    runs-on: arc-runner-set
    steps:
      - run: echo "Running on ARC"
```

<Callout type="warn" title="Kiểm tra phiên bản ARC">
  Tên field Helm và khả năng label có thể khác giữa các thế hệ hoặc phiên bản chart. Trước khi nâng cấp, đối chiếu tài liệu và `values.yaml` đúng phiên bản chart đang cài; không sao chép cấu hình của community ARC cũ sang runner scale sets hiện hành mà không kiểm tra.
</Callout>

## Thiết kế taxonomy labels

### Một chiều thông tin cho mỗi label

Một taxonomy tốt giúp đọc `runs-on` như một câu mô tả máy. Chọn prefix ổn định cho từng chiều:

| Chiều | Ví dụ | Khi nào dùng |
|---|---|---|
| Năng lực | `cap-docker`, `cap-gpu-nvidia` | Phần cứng hoặc dịch vụ cục bộ |
| Mạng | `net-public`, `net-private` | Vùng kết nối mà job cần |
| Toolchain | `toolchain-android`, `toolchain-ios` | Bộ công cụ được quản lý sẵn |
| Kích thước | `size-medium`, `size-large` | Hạng tài nguyên do nền tảng định nghĩa |
| Vòng đời | `lifecycle-ephemeral` | Đặc tính cấp phát và dọn dẹp |

Quy ước nên:

- dùng chữ thường và dấu gạch ngang;
- mô tả năng lực ổn định, không mô tả tên người hoặc ticket tạm thời;
- có owner và định nghĩa kiểm chứng cho mỗi label;
- không tạo nhiều từ đồng nghĩa như `gpu`, `nvidia`, `cuda-runner` nếu chúng cùng một ý;
- không nhét nhiều chiều vào một label dài như `linux-x64-prod-private-gpu` trừ khi đó là tên pool chủ ý cho runner không có labels mặc định.

### Dùng group cho trust boundary

Dùng label để trả lời “máy làm được gì”, và group để trả lời “ai được chạy code trên máy”. Ví dụ:

| Nhu cầu | Công cụ phù hợp |
|---|---|
| Runner có GPU | Label `cap-gpu-nvidia` |
| Runner truy cập mạng riêng | Label `net-private` |
| Chỉ repository thanh toán được deploy | Group `rg-prod-payment` với Selected repositories |
| Chỉ workflow release chuẩn được chạy | Workflow access policy của group |

Không dùng `env-prod` như biện pháp bảo mật duy nhất. Một quản trị viên gán nhầm label có thể làm job đi vào runner không mong muốn, trong khi group policy tạo thêm lớp kiểm soát truy cập.

### Ngăn định tuyến nhầm

Áp dụng các biện pháp sau cho pool quan trọng:

1. **Kết hợp group và labels.** Group giới hạn chủ thể; labels giới hạn năng lực.
2. **Dùng labels loại trừ lẫn nhau.** Ví dụ, mỗi runner chỉ có một trong `net-public` hoặc `net-private`.
3. **Kiểm tra trước khi gán label.** Automation chỉ gán `cap-docker` sau khi `docker info` thành công.
4. **Đối soát inventory định kỳ.** So sánh labels trên GitHub với CMDB, Terraform hoặc dữ liệu Kubernetes thực tế.
5. **Tách production khỏi CI không tin cậy.** Không để pull request từ fork chạy trên runner có credential hoặc kết nối production.
6. **Giữ tên group duy nhất toàn enterprise.** Prefix tên thật như `org-acme-` hoặc `ent-shared-` giúp tránh trùng tên và dễ audit.
7. **Không phụ thuộc tên runner.** `runs-on` định tuyến theo label hoặc group, không theo giá trị hiển thị của runner name.

## Bài thực hành

Bài thực hành tạo một organization runner group, đăng ký runner có Docker và chạy workflow chỉ khi group lẫn labels đều khớp.

### Yêu cầu chuẩn bị

- Một organization GitHub và repository thử nghiệm private.
- Quyền quản lý organization runners và runner groups.
- Một máy Linux x64 có Docker, có thể kết nối outbound HTTPS đến GitHub.
- Registration token mới lấy từ màn hình thêm self-hosted runner. Token này có thời hạn ngắn; không commit vào repository.

### Tạo group và đăng ký runner

1. Vào **Organization Settings → Actions → Runner groups**.
2. Tạo group `rg-ci-private`.
3. Chọn **Selected repositories** và chỉ thêm repository thử nghiệm.
4. Trên máy runner đã tải và giải nén runner application, chạy lệnh đăng ký:

```bash
export RUNNER_TOKEN="<registration-token>"

./config.sh \
  --url https://github.com/ACME \
  --token "$RUNNER_TOKEN" \
  --name lab-linux-01 \
  --runnergroup rg-ci-private \
  --labels cap-docker,env-lab
```

5. Cài runner dưới dạng service theo hướng dẫn được GitHub hiển thị, hoặc chạy tương tác trong lab:

```bash
./run.sh
```

Sau khi online, runner phải có ít nhất các labels `self-hosted`, `linux`, `x64`, `cap-docker`, `env-lab` và thuộc group `rg-ci-private`.

### Tạo workflow kiểm chứng

Tạo `.github/workflows/runner-routing-lab.yml` trong repository đã được policy cho phép:

```yaml
name: Runner routing lab

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify-routing:
    runs-on:
      group: rg-ci-private
      labels: [self-hosted, linux, x64, cap-docker, env-lab]

    steps:
      - name: Show selected runner
        run: |
          echo "name=${{ runner.name }}"
          echo "os=${{ runner.os }}"
          echo "arch=${{ runner.arch }}"

      - name: Verify declared capability
        run: docker version
```

Chạy workflow từ tab **Actions**. Bài lab đạt khi:

- job rời trạng thái queued và chạy trên `lab-linux-01`;
- log hiển thị Linux và X64;
- bước `docker version` thành công;
- repository ngoài allowlist không nhìn thấy hoặc không dùng được group này.

### Kiểm tra cả trường hợp không khớp

Đổi tạm `env-lab` thành một label không tồn tại:

```yaml
runs-on:
  group: rg-ci-private
  labels: [self-hosted, linux, x64, cap-docker, env-does-not-exist]
```

Chạy lại workflow. Job phải ở trạng thái queued vì không runner nào thỏa toàn bộ mảng labels. Hủy run sau khi quan sát, sau đó khôi phục `env-lab`; không cần chờ timeout 24 giờ.

Tiếp theo, thử workflow từ một repository không nằm trong **Selected repositories**. Kết quả này kiểm chứng policy group, không chỉ cơ chế label.

## Best practices

- **Mặc định dùng group cộng labels cho workload nhạy cảm.** Mapping syntax thể hiện rõ cả trust boundary và năng lực.
- **Giữ `self-hosted` ở đầu mảng cho runner thông thường.** Ngoại lệ là runner dùng `--no-default-labels` và ARC không có label này.
- **Dùng Selected repositories theo nguyên tắc đặc quyền tối thiểu.** Không chọn All repositories chỉ để xử lý nhanh một lỗi queued.
- **Giới hạn workflow cho deployment runner nếu gói GitHub hỗ trợ.** Pin workflow bằng `refs/tags/...` hoặc full SHA khi cần tính bất biến.
- **Chuẩn hóa taxonomy trong code.** Quản lý danh mục label, owner, câu lệnh health check và ngày rà soát trong repository nền tảng.
- **Tự động hóa gán label từ nguồn sự thật.** Không để thao tác tay trở thành quy trình production duy nhất.
- **Tách pool theo mức tin cậy.** Build pull request, ký artifact và deploy production nên dùng group hoặc runner khác nhau.
- **Theo dõi thời gian queued theo tổ hợp group/labels.** Queue tăng có thể do thiếu capacity hoặc drift labels.
- **Thay đổi có kiểm soát.** Khi đổi tên label hoặc group, duy trì giai đoạn chuyển tiếp, cập nhật workflows rồi mới gỡ tên cũ.
- **Không dùng label để lưu dữ liệu bí mật.** Labels có thể xuất hiện trong UI, API, workflow và log vận hành.

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| Job queued dù runner đang online | Runner thiếu một label trong mảng AND | So sánh từng giá trị trong `runs-on` với labels hiển thị trên runner; kiểm tra lỗi chính tả và label vừa bị gỡ |
| Job queued khi dùng group và labels | Runner đúng labels nhưng nằm sai group, hoặc policy không cho repository/workflow truy cập | Kiểm tra membership của runner, repository access và workflow access tại đúng cấp org/enterprise |
| Workflow chạy nhầm pool | Labels quá rộng hoặc nhiều pool chia sẻ cùng tập labels | Thêm group cụ thể, tạo label phân biệt pool và loại bỏ label sai khỏi runner |
| Runner tạo với `--no-default-labels` không nhận job | Workflow vẫn yêu cầu `self-hosted`, `linux` hoặc `x64` | Dùng các custom labels đã gán, hoặc chủ động gán lại labels cần thiết |
| Group báo không tìm thấy khi đăng ký | Giá trị `--runnergroup` sai hoặc group chưa tồn tại trong đúng scope | Tạo group trước, kiểm tra chính tả và đăng ký runner bằng URL org/enterprise phù hợp |
| Workflow thất bại vì group mơ hồ | Organization và enterprise có group cùng tên | Đổi tên một group hoặc dùng `org/`, `organization/`, `ent/`, `enterprise/` trong `group` |
| Repository không thấy enterprise group | Enterprise chưa chia sẻ group cho organization, hoặc org chưa cấp repository access | Kiểm tra lần lượt policy enterprise rồi policy organization; policy dưới không thể nới policy trên |
| Selected workflow vẫn không dùng được group | Allowlist sai owner/repo/path/ref hoặc job nằm trong reusable workflow khác | Dùng đường dẫn đầy đủ, pin ref rõ ràng và allowlist workflow trực tiếp định nghĩa job |
| ARC job queued khi có `self-hosted` | ARC hiện hành không hỗ trợ label `self-hosted` | Dùng runner scale set name hoặc đúng labels đã cấu hình cho scale set |
| Labels ARC không hoạt động sau nâng cấp | Field hoặc khả năng của Helm chart không khớp phiên bản tài liệu | Đọc `values.yaml` và release notes đúng chart version; kiểm tra tài nguyên scale set sau khi render Helm |
| Job được gán rồi quay lại queued | Runner không nhận job trong 60 giây, service chậm hoặc mất kết nối | Kiểm tra runner service, network outbound và diagnostic logs; GitHub sẽ re-queue để runner khác nhận |
| Job queued rất lâu rồi thất bại | Không có runner phù hợp online/idle trong 24 giờ | Khôi phục capacity, sửa group/labels/policy và chạy lại workflow sau khi runner sẵn sàng |
| Custom label cũ vẫn xuất hiện | Label vừa không còn được sử dụng | Chờ tối đa 24 giờ để GitHub tự xóa; custom label không dùng không thể xóa thủ công ngay |

## Tài liệu tham khảo

- [Using labels with self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/apply-labels)
- [Using self-hosted runners in a workflow](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)
- [Choosing the runner for a job](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)
- [Managing access to self-hosted runners using groups](https://docs.github.com/en/enterprise-cloud@latest/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
- [Self-hosted runners reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [Using Actions Runner Controller runners in a workflow](https://docs.github.com/en/actions/how-tos/manage-runners/use-actions-runner-controller/use-arc-in-a-workflow)

## Các trang runners liên quan

<Cards>
  <Card title="Self-hosted runners" href="/docs/runners/02-self-hosted-runners" description="Cài đặt và quản lý runner do bạn vận hành." />
  <Card title="Larger runners" href="/docs/runners/04-larger-runners" description="Dùng máy GitHub-hosted có cấu hình và mạng nâng cao." />
  <Card title="Autoscaling với ARC" href="/docs/runners/05-autoscaling-arc" description="Mở rộng runner scale sets trên Kubernetes." />
  <Card title="Runner hardening" href="/docs/runners/06-runner-hardening" description="Giảm rủi ro khi workflow chạy mã trên runner." />
  <Card title="Monitoring và maintenance" href="/docs/runners/07-runner-monitoring-maintenance" description="Theo dõi capacity, queue và sức khỏe runner." />
</Cards>
