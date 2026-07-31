---
title: "Bảo mật third-party actions"
description: "Đánh giá, pin, cập nhật và kiểm soát action bên thứ ba theo nguyên tắc quyền tối thiểu và chuỗi cung ứng có thể kiểm chứng."
---

<Callout type="warn" title="Coi action như mã có đặc quyền">
  Một action không chỉ là một dòng YAML. Nó là mã được tải về và chạy trong ranh giới tin cậy của job, có thể đọc workspace, gọi mạng, sửa môi trường cho step sau và dùng `GITHUB_TOKEN` theo quyền của job. Chỉ đưa action vào workflow sau khi đã đánh giá source, cố định đúng commit và giới hạn blast radius.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
  - [Ranh giới tin cậy của một job](#ranh-giới-tin-cậy-của-một-job)
  - [Full commit SHA giải quyết điều gì](#full-commit-sha-giải-quyết-điều-gì)
- [Mô hình đe dọa](#mô-hình-đe-dọa)
  - [Tài sản và tác nhân](#tài-sản-và-tác-nhân)
  - [Các đường tấn công chính](#các-đường-tấn-công-chính)
  - [Input output và post step](#input-output-và-post-step)
- [Đánh giá trước khi chấp nhận action](#đánh-giá-trước-khi-chấp-nhận-action)
  - [Đánh giá publisher](#đánh-giá-publisher)
  - [Đánh giá repository](#đánh-giá-repository)
  - [Đánh giá release và ref](#đánh-giá-release-và-ref)
  - [Đánh giá source và build artifact](#đánh-giá-source-và-build-artifact)
  - [Hiểu đúng Verified creator](#hiểu-đúng-verified-creator)
- [Thiết kế kiểm soát trong workflow](#thiết-kế-kiểm-soát-trong-workflow)
  - [Pin full-length commit SHA](#pin-full-length-commit-sha)
  - [Cấp permissions tối thiểu](#cấp-permissions-tối-thiểu)
  - [Tách job và tách secrets](#tách-job-và-tách-secrets)
  - [Dùng reusable workflow làm ranh giới quản trị](#dùng-reusable-workflow-làm-ranh-giới-quản-trị)
  - [Áp dụng allowlist và block policy](#áp-dụng-allowlist-và-block-policy)
- [Cập nhật và giám sát dependency](#cập-nhật-và-giám-sát-dependency)
  - [Dependabot version updates cho actions](#dependabot-version-updates-cho-actions)
  - [Quy trình cập nhật SHA có kiểm chứng](#quy-trình-cập-nhật-sha-có-kiểm-chứng)
  - [Dependency graph advisory và log](#dependency-graph-advisory-và-log)
- [Audit repository](#audit-repository)
  - [Kiểm kê nhanh bằng grep](#kiểm-kê-nhanh-bằng-grep)
  - [Chặn ref không bất biến bằng script](#chặn-ref-không-bất-biến-bằng-script)
  - [Bảo vệ thay đổi bằng CODEOWNERS](#bảo-vệ-thay-đổi-bằng-codeowners)
- [Bài thực hành](#bài-thực-hành)
  - [Chuẩn bị](#chuẩn-bị)
  - [Triển khai policy check](#triển-khai-policy-check)
  - [Tình huống kiểm thử](#tình-huống-kiểm-thử)
  - [Tiêu chí kiểm chứng](#tiêu-chí-kiểm-chứng)
- [Checklist và best practices](#checklist-và-best-practices)
  - [Checklist phê duyệt action mới](#checklist-phê-duyệt-action-mới)
  - [Best practices khi vận hành](#best-practices-khi-vận-hành)
  - [Anti-patterns cần tránh](#anti-patterns-cần-tránh)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Tổng quan

**Third-party action** trong chương này là action được lấy từ repository nằm ngoài codebase mà nhóm đang trực tiếp kiểm soát. Khái niệm này có thể bao gồm action trên Marketplace, action trong một organization khác và cả action do GitHub phát hành nếu chính sách nội bộ vẫn xem đó là dependency bên ngoài.

Một dòng như sau yêu cầu runner tải code tại một Git ref rồi thực thi code đó:

```yaml
- uses: OWNER/REPOSITORY@REF
```

`REF` có thể là branch, tag hoặc commit SHA. Branch và tag là tên tham chiếu có thể bị di chuyển. Full commit SHA là định danh đầy đủ của một commit và là cách GitHub khuyến nghị để tạo tham chiếu bất biến.

Mục tiêu bảo mật không phải là tìm một action “hoàn toàn đáng tin”. Mục tiêu là tạo nhiều lớp kiểm soát:

1. chỉ chấp nhận publisher và repository đã đánh giá;
2. review đúng source sẽ được thực thi;
3. pin full-length commit SHA;
4. giới hạn token, secret, runner và dữ liệu action có thể tiếp cận;
5. tự động phát hiện ref không tuân thủ;
6. cập nhật qua pull request có review và khả năng rollback.

### Ranh giới tin cậy của một job

Các step trong cùng một job không phải các sandbox độc lập. JavaScript action và composite action chạy trực tiếp trong ngữ cảnh runner. Docker action có lớp container, nhưng thường vẫn được cấp input, biến môi trường và mount workspace; vì vậy container không biến mã không tin cậy thành mã an toàn.

Một action trong job có thể:

- đọc và sửa file trong `$GITHUB_WORKSPACE`;
- đọc biến môi trường và secret đã được đưa vào ngữ cảnh thực thi của nó;
- truy cập `github.token` ngay cả khi workflow không truyền `${{ secrets.GITHUB_TOKEN }}` tường minh;
- gọi mạng để gửi dữ liệu ra ngoài;
- ghi vào `GITHUB_ENV`, `GITHUB_PATH` hoặc `GITHUB_OUTPUT` để ảnh hưởng step sau;
- tạo hoặc sửa artifact, cache và file mà job khác sẽ tiêu thụ;
- trên self-hosted runner, dò credential, process hoặc dịch vụ mạng còn tồn tại trên máy.

Các secret thông thường không tự động trở thành biến môi trường của mọi action. Tuy nhiên, action sẽ thấy secret được truyền qua `with`, `env` hoặc file. Nó cũng có thể thấy dữ liệu nhạy cảm mà step trước đã ghi vào workspace hay process state. Vì vậy, **mọi action trong cùng job phải được tin cậy tương xứng với quyền và secret cao nhất mà job đó sử dụng**.

```text
Sự kiện → Job và permissions → Action bên thứ ba → Workspace / mạng / outputs
                              │
                              ├─ github.token theo quyền của job
                              ├─ secrets được truyền hoặc materialize
                              └─ post step chạy khi job kết thúc
```

<Callout type="error" title="Không truyền token vẫn chưa đủ">
  GitHub ghi rõ action có thể truy cập `GITHUB_TOKEN` qua `github.token` dù workflow không truyền token làm input. Cách phòng thủ đúng là hạ `permissions` của job, không chỉ xóa input `token`.
</Callout>

### Full commit SHA giải quyết điều gì

Pin full SHA ngăn nội dung tại dòng `uses` thay đổi chỉ vì maintainer hoặc kẻ tấn công di chuyển tag. Đây là kiểm soát quan trọng nhất đối với ref, nhưng không giải quyết mọi rủi ro.

| Rủi ro | Full SHA có giảm rủi ro không? | Kiểm soát bổ sung |
|---|---:|---|
| Tag `v1` bị retarget sang commit khác | Có | xác minh SHA thuộc repository gốc |
| Branch `main` nhận code mới | Có | không dùng branch cho production |
| Commit đã pin vốn chứa mã độc | Không | review source và kiểm thử trước khi chấp nhận |
| Maintainer hoặc tài khoản publisher bị compromise sau khi đã pin | Có, cho đến lần cập nhật | cập nhật qua PR có review |
| Dependency đã được bundle trong commit có lỗ hổng | Không | review lockfile, bundle, advisory và diff |
| Action tải script hoặc image theo URL hay tag mutable lúc chạy | Không | pin digest/checksum cho dependency runtime |
| Token có quyền quá rộng | Không | `permissions` tối thiểu và tách job |
| Input hoặc output bị dùng không an toàn | Không | validate dữ liệu và tránh nội suy vào shell |

Nói ngắn gọn: **pin SHA cố định bytes từ repository action; nó không chứng minh bytes đó an toàn**.

## Mô hình đe dọa

### Tài sản và tác nhân

Trước khi duyệt một action, hãy ghi rõ tài sản mà job có thể làm lộ hoặc thay đổi.

| Nhóm | Ví dụ |
|---|---|
| Source và lịch sử Git | code private, branch, tag, release, pull request |
| Credential | `GITHUB_TOKEN`, GitHub App token, deploy key, registry token |
| Hạ tầng | quyền OIDC, cloud role, Kubernetes credentials, network nội bộ |
| Sản phẩm build | binary, package, container image, checksum, provenance |
| Runner | file hệ thống, tool cache, Docker socket, credential còn sót |
| Kênh liên kết job | output, artifact, cache, workspace dùng chung trên runner |

Tác nhân đe dọa có thể là:

- maintainer cố ý chèn mã độc;
- kẻ tấn công chiếm tài khoản maintainer, token phát hành hoặc GitHub App;
- contributor đưa dependency transitive độc hại vào action;
- attacker kiểm soát input từ issue, pull request, branch name hoặc artifact;
- người nội bộ cấu hình nhầm permission, secret hoặc allowlist;
- kẻ tấn công đã chiếm self-hosted runner.

### Các đường tấn công chính

| Đường tấn công | Kịch bản cụ thể | Hậu quả có thể xảy ra |
|---|---|---|
| Compromise maintainer | tài khoản có quyền ghi bị chiếm và phát hành code độc hại | đánh cắp token, sửa release, đầu độc artifact |
| Tag retarget | `v1` hoặc `v1.2.3` bị chuyển sang commit khác | workflow không đổi nhưng code chạy đã đổi |
| Dependency transitive | package npm, base image hoặc binary tải về bị compromise | mã độc chạy bên trong action đã được tin tưởng |
| Build artifact lệch source | `dist/index.js` không được tạo từ source đang review | reviewer duyệt TypeScript sạch nhưng runner chạy bundle khác |
| Mutable download | action pin SHA nhưng `curl` script mới nhất hoặc dùng image tag | hành vi thay đổi mà commit action không đổi |
| Malicious input | title PR hoặc đường dẫn do attacker đặt đi vào shell | command injection, path traversal, đọc file ngoài phạm vi |
| Malicious output | action tạo output chứa shell syntax hoặc đường dẫn nguy hiểm | step sau bị injection hoặc upload nhầm file nhạy cảm |
| Post step | `runs.post` hoặc `post-entrypoint` thực thi ở cuối job | exfiltrate dữ liệu, sửa cleanup, giữ persistence trên runner |
| Cache hoặc artifact poisoning | job không tin cậy tạo dữ liệu cho job đặc quyền | job deploy tiêu thụ binary hoặc metadata bị thay thế |
| Self-hosted persistence | action sửa máy, service hoặc Docker daemon | ảnh hưởng run sau và repository khác dùng cùng runner |

**Dependency transitive** là dependency của dependency. Ví dụ, workflow gọi action A; action A bundle thư viện B; B lại dùng C. Pin commit của A cố định bundle hiện có, nhưng reviewer vẫn phải hiểu B và C có nằm trong bundle hay được tải động khi chạy.

### Input output và post step

Trong các ví dụ tổng quát trên trang này, `FULL_40_CHARACTER_COMMIT_SHA` là ký hiệu mẫu, bắt buộc thay bằng SHA 40 ký tự đã xác minh từ repository canonical. Chuỗi đó không phải SHA thật và không được sao chép nguyên vào workflow.

Input của action là dữ liệu không tin cậy nếu nguồn của nó có thể do người ngoài kiểm soát. Ví dụ sau chuyển title của pull request vào action:

```yaml
- uses: OWNER/REPOSITORY@FULL_40_CHARACTER_COMMIT_SHA
  with:
    title: ${{ github.event.pull_request.title }}
```

Dòng trên không tự động tạo injection. Rủi ro nằm ở cách action xử lý `title`. Nếu action ghép input vào `exec("tool " + title)` hoặc shell script, title có thể trở thành lệnh. Khi review source, hãy tìm `exec`, `spawn` với chế độ shell, `eval`, template shell và chuỗi lệnh ghép từ input.

Output cũng phải được coi là không tin cậy. Anti-pattern sau nội suy output trực tiếp vào script được GitHub tạo trước khi shell chạy:

```yaml
- id: inspect
  uses: OWNER/REPOSITORY@FULL_40_CHARACTER_COMMIT_SHA

- name: Không an toàn nếu output bị kiểm soát
  run: echo "${{ steps.inspect.outputs.result }}"
```

Cách tốt hơn là chuyển output qua biến môi trường, quote biến và kiểm tra format trước khi dùng:

```yaml
- name: Validate output trước khi dùng
  env:
    RESULT: ${{ steps.inspect.outputs.result }}
  shell: bash
  run: |
    set -euo pipefail
    if [[ ! "$RESULT" =~ ^[A-Za-z0-9._-]{1,64}$ ]]; then
      printf 'Output không hợp lệ\n' >&2
      exit 1
    fi
    printf 'Kết quả: %s\n' "$RESULT"
```

Biến môi trường chỉ loại bỏ bước nội suy vào source shell. Nó không an toàn nếu script tiếp tục dùng `eval`, không quote biến hoặc dùng giá trị làm đường dẫn mà không kiểm tra.

Action JavaScript có thể khai báo `runs.pre`, `runs.main` và `runs.post`. Docker action có thể khai báo `pre-entrypoint`, `entrypoint` và `post-entrypoint`. Theo metadata syntax của GitHub, post action mặc định chạy ở cuối job với điều kiện `always()` nếu publisher không đặt `post-if` khác. Vì vậy, đừng chỉ review entrypoint chính; hãy review toàn bộ lifecycle và dữ liệu ghi qua `GITHUB_STATE`.

<Callout type="warn" title="Step cleanup vẫn là code có đặc quyền">
  Tên như “cleanup”, “save cache” hoặc “logout” không làm post step ít nguy hiểm hơn. Post step chạy muộn, sau khi nhiều file và credential tạm đã xuất hiện trên runner.
</Callout>

## Đánh giá trước khi chấp nhận action

Đánh giá nên tạo ra một bản ghi có: owner, repository canonical, mục đích, release được chọn, full SHA, ngày review, reviewer, quyền cần cấp, secret cần truyền và kế hoạch cập nhật. Với action có quyền ghi hoặc cloud credential, yêu cầu ít nhất hai người review.

### Đánh giá publisher

Kiểm tra danh tính trước khi đọc code:

- Link Marketplace phải dẫn về đúng repository canonical.
- Owner là cá nhân, organization, vendor hay một tên gần giống dự án thật?
- Website và tài liệu chính thức của vendor có liên kết ngược đến repository không?
- Repository có vừa chuyển owner, đổi tên hoặc được archive không?
- Ai có quyền phát hành? Có nhiều maintainer hoạt động hay chỉ một tài khoản?
- Publisher có `SECURITY.md`, kênh báo cáo lỗ hổng và lịch sử phản hồi advisory không?
- Release có được tạo bởi quy trình rõ ràng, GitHub App hoặc maintainer đã biết không?

Số sao, số lượt dùng và tuổi repository là tín hiệu hỗ trợ, không phải bằng chứng an toàn. Action phổ biến vẫn có thể bị compromise; action ít phổ biến vẫn có thể được duy trì tốt.

### Đánh giá repository

Đọc repository ở đúng commit dự định pin, không chỉ đọc default branch hiện tại.

Checklist tối thiểu:

1. Mở `action.yml` hoặc `action.yaml` để xác định loại action và entrypoint.
2. Đọc mọi script được gọi từ `runs.main`, `runs.pre`, `runs.post`, composite steps hoặc Docker entrypoint.
3. Tìm network call, upload, telemetry và danh sách host đích.
4. Tìm nơi đọc input, context, workspace, credential và file hệ thống.
5. Kiểm tra dependency manifest, lockfile, base image và binary vendored.
6. Đọc workflow release để hiểu source được build thành `dist` hoặc image như thế nào.
7. Xem commit gần release, contributor mới, thay đổi quyền và thay đổi ownership.
8. Kiểm tra issue, security advisory, release notes và breaking change chưa giải quyết.
9. Xác nhận license và điều kiện pháp lý phù hợp với tổ chức.

Các từ khóa gợi ý khi review source:

```bash
git grep -nE 'curl|wget|fetch\(|axios|https?://|exec\(|spawn\(|eval\(|GITHUB_(TOKEN|ENV|PATH|OUTPUT|STATE)|github\.token|process\.env|post-entrypoint|runs\.post'
```

Kết quả grep chỉ là điểm bắt đầu. Ví dụ `execFile` với mảng argument thường an toàn hơn ghép chuỗi vào `exec`, nhưng vẫn phải kiểm tra executable và từng argument.

### Đánh giá release và ref

Ưu tiên exact release tag như `v2.4.1` để tìm commit cần review. Sau đó pin **commit** đứng sau tag, không dùng tag trong workflow production.

Đối với release dự định dùng, hãy kiểm tra:

- tag nằm trong repository canonical, không phải fork;
- tag trỏ đến commit nào tại thời điểm review;
- release notes mô tả thay đổi, permission và migration;
- diff từ phiên bản đang dùng đến phiên bản mới;
- commit hoặc tag có chữ ký `Verified` phù hợp với chính sách hay không;
- commit release có đi qua protected branch và required checks hay không;
- release artifact, checksum hoặc attestation có tồn tại nếu action tải binary;
- tag có bị xóa rồi tạo lại hoặc release có dấu hiệu bất thường không.

Chữ ký hợp lệ tăng độ tin cậy về nguồn gốc khóa ký. Nó không chứng minh logic an toàn, test đầy đủ hay tài khoản ký chưa bị compromise. Kết luận hành động vẫn là: xác minh danh tính, review diff và pin SHA.

### Đánh giá source và build artifact

Runner thực thi entrypoint trong metadata, không nhất thiết thực thi file source dễ đọc nhất.

| Loại action | Thành phần phải review | Rủi ro thường gặp |
|---|---|---|
| JavaScript | `action.yml`, `runs.main`, `pre`, `post`, bundle trong `dist` | bundle không khớp source, package transitive, network call ẩn |
| Composite | toàn bộ `runs.steps`, action lồng nhau và shell script | nested `uses` không pin, input ghép vào shell, PATH bị sửa |
| Dockerfile | Dockerfile, base image, entrypoint, script tải binary | base image mutable, package cài lúc build, checksum bị bỏ qua |
| Prebuilt Docker image | registry, image digest, provenance và entrypoint | tag image bị retarget, source repository không khớp image |

Với JavaScript action, publisher thường commit bundle như `dist/index.js` để runner không cần `npm install`. Review chỉ `src/` là chưa đủ. Hãy:

1. kiểm tra `runs.main` thực sự trỏ đến file nào;
2. đọc diff của `dist` cùng diff source;
3. nếu dự án công bố quy trình build tái lập, build từ source trong môi trường cô lập;
4. so sánh output build với bundle đã commit;
5. giải thích mọi sai khác trước khi phê duyệt.

Ví dụ kiểm tra bundle khi publisher dùng script build xác định:

```bash
npm ci --ignore-scripts
npm run build
git status --short -- dist/
git diff --exit-code -- dist/
```

Chỉ chạy lệnh trên trong container hoặc runner review không có secret. `npm ci` và build script cũng là code của dependency, nên không chạy chúng trên máy có credential nhạy cảm.

Với Docker action, pin commit repository không cố định image ngoài repository nếu metadata dùng `image: docker://vendor/image:tag`. Yêu cầu image digest dạng `sha256:...` và provenance phù hợp. Nếu Dockerfile tải binary, URL phải gắn version bất biến và phải kiểm checksum đã lấy từ kênh độc lập.

### Hiểu đúng Verified creator

Badge **Verified creator** trên GitHub Marketplace cho biết GitHub đã xác minh danh tính của team tạo action như một partner organization. Đây là tín hiệu hữu ích để giảm rủi ro giả mạo publisher.

Badge này **không** bảo đảm rằng:

- mọi dòng code đã được GitHub security audit;
- release hoặc dependency không có lỗ hổng;
- tag không thể bị di chuyển;
- tài khoản maintainer không thể bị compromise;
- action phù hợp với threat model và permission của bạn.

GitHub cũng cho phép organization hoặc enterprise bật lựa chọn “Allow Marketplace actions by verified creators”. Đây là allowlist rộng dựa trên danh tính, không thay thế allowlist repository cụ thể và pin SHA.

<Callout type="info" title="Verified creator là tín hiệu, không phải chứng nhận tuyệt đối">
  Dùng badge để hỗ trợ đánh giá publisher. Vẫn review repository, release, source, dependency và full SHA như với mọi action khác.
</Callout>

## Thiết kế kiểm soát trong workflow

### Pin full-length commit SHA

GitHub xác định pin full-length commit SHA là cách duy nhất hiện hành để dùng action như một release bất biến. Không dùng SHA rút gọn.

Ví dụ dưới đây dùng commit chính thức của exact release `actions/checkout@v6.0.2`, đã được đối chiếu với API của repository `actions/checkout` khi biên soạn tài liệu:

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
    with:
      persist-credentials: false
```

Comment cùng dòng giữ khả năng đọc cho reviewer. GitHub Docs cũng ghi nhận Dependabot có thể cập nhật version documentation khi comment nằm cùng dòng với action ref.

So sánh các lựa chọn:

| Ref | Tính bất biến | Nhận cập nhật tự động | Khuyến nghị |
|---|---:|---:|---|
| Full SHA 40 ký tự | Có | Qua Dependabot PR | production và job nhạy cảm |
| Exact tag `v6.0.2` | Không; tag có thể di chuyển hoặc xóa | Không cần đổi YAML nếu tag bị di chuyển | chỉ khi chấp nhận rủi ro publisher |
| Major tag `v6` | Không | Tự nhận thay đổi trong major | thuận tiện nhưng không phù hợp threat model nghiêm ngặt |
| Branch `main` | Không | Nhận mọi commit mới | chỉ dùng thử nghiệm có cô lập |

Trade-off của full SHA là không tự nhận bug fix hoặc security fix. Giải pháp không phải quay lại moving tag. Hãy bật Dependabot version updates, review PR cập nhật và có SLA xử lý advisory.

<Callout type="warn" title="SHA phải đến từ repository gốc">
  Một commit SHA từ fork vẫn là một SHA hợp lệ. Xác minh nó được phân giải từ tag hoặc commit trong repository canonical trước khi đưa vào workflow.
</Callout>

### Cấp permissions tối thiểu

Đặt `permissions` ở workflow hoặc từng job. Giá trị ở job cho thấy chính xác action trong job đó có thể dùng token để làm gì.

Job chỉ đọc source:

```yaml
permissions: {}

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
```

Job không cần truy cập API GitHub:

```yaml
jobs:
  local-check:
    runs-on: ubuntu-latest
    permissions: {}
    steps:
      - run: ./scripts/check-generated-files.sh
```

Nếu job cần comment lên pull request, chỉ cấp đúng scope:

```yaml
permissions: {}

jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
```

Không cấp `write-all`. Không cấp `id-token: write` cho job không thực hiện OIDC. Không dùng personal access token quyền rộng khi `GITHUB_TOKEN` hoặc GitHub App token ngắn hạn có scope hẹp đáp ứng được.

`actions/checkout` mặc định có thể lưu credential vào Git config để lệnh Git sau dùng. Đặt `persist-credentials: false` nếu các step sau không cần push. Đây là lớp bổ sung; quyền thật sự vẫn do `permissions` quyết định.

### Tách job và tách secrets

Tách action không tin cậy khỏi job đặc quyền làm giảm blast radius. Mỗi GitHub-hosted job chạy trên môi trường mới; dữ liệu chỉ nên đi qua output hoặc artifact được thiết kế rõ. Với self-hosted runner, cần runner tạm thời, sạch và runner group riêng để ranh giới này có ý nghĩa.

Mẫu thiết kế:

```yaml
permissions: {}

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - name: Chạy phân tích không có deploy secret
        uses: OWNER/REPOSITORY@FULL_40_CHARACTER_COMMIT_SHA

  deploy:
    needs: analyze
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Xác thực cloud bằng OIDC
        run: ./scripts/authenticate-and-deploy.sh
```

Các nguyên tắc tách:

- Không đặt secret deploy trong job lint, test hoặc phân tích third-party.
- Không dùng `secrets: inherit` nếu chỉ cần một secret; ánh xạ từng secret theo tên.
- Dùng environment có required reviewers cho production.
- Job đặc quyền không checkout code không tin cậy từ fork.
- Artifact từ job không tin cậy phải được coi là input không tin cậy: kiểm tên, kích thước, định dạng, checksum và chống path traversal trước khi dùng.
- Không đưa executable từ job không tin cậy thẳng vào bước ký hoặc publish.
- Với self-hosted runner, không dùng chung máy hoặc Docker socket giữa job không tin cậy và job deploy.

Tách job không tự động làm output an toàn. Job `deploy` phải validate mọi giá trị từ `needs`, artifact và cache trước khi dùng.

### Dùng reusable workflow làm ranh giới quản trị

**Reusable workflow** là workflow được gọi ở cấp job bằng `jobs.<id>.uses`. Tổ chức có thể đặt reusable workflow đã harden trong repository trung tâm để chuẩn hóa:

- action nào được phép dùng;
- full SHA đã được phê duyệt;
- `permissions` tối đa;
- input có kiểu và validation;
- secret nào được caller truyền;
- environment approval và runner group.

Caller ngoài repository nên pin reusable workflow bằng full SHA:

```yaml
jobs:
  secure-build:
    permissions:
      contents: read
    uses: ORG/PLATFORM-AUTOMATION/.github/workflows/build.yml@FULL_40_CHARACTER_COMMIT_SHA
    with:
      runtime: node
    secrets:
      registry_token: ${{ secrets.READ_ONLY_REGISTRY_TOKEN }}
```

Các nguyên tắc bảo mật third-party action cũng áp dụng cho third-party reusable workflow. Full SHA là lựa chọn an toàn nhất cho workflow ngoài repository. Với workflow trong cùng repository, dùng `./.github/workflows/build.yml`; GitHub lấy file từ cùng commit với caller.

Không dùng reusable workflow như một lớp che giấu. Consumer vẫn cần biết workflow trung tâm gọi action nào và chuyển secret nào. Dependency graph của GitHub nhận diện cả `jobs[*].steps[*].uses` và `jobs.<job_id>.uses`, nên hãy dùng nó để audit cây dependency.

<Callout type="warn" title="Không kế thừa toàn bộ secrets theo thói quen">
  `secrets: inherit` làm hợp đồng khó review và truyền mọi secret caller có thể truy cập đến workflow được gọi trực tiếp. Với workflow nhạy cảm, truyền từng secret và tiếp tục giới hạn ở mỗi tầng lồng nhau.
</Callout>

### Áp dụng allowlist và block policy

Organization owner cấu hình tại **Organization Settings → Actions → General → Policies**. Enterprise owner cấu hình tại **Enterprise → Policies → Actions**. Policy enterprise có thể giới hạn lựa chọn mà organization được phép nới.

Chính sách khuyến nghị cho production:

1. Chọn **Allow organization/enterprise, and select non-organization/non-enterprise, actions and reusable workflows**.
2. Bật action do GitHub tạo nếu tổ chức chấp nhận nhóm `actions` và `github`.
3. Thêm từng repository hoặc ref ngoài tổ chức đã phê duyệt.
4. Bật **Require actions to be pinned to a full-length commit SHA**.
5. Dùng block pattern cho dependency bị cấm hoặc đang có sự cố.
6. Review danh sách định kỳ và xóa dependency không còn dùng.

Ví dụ pattern chính sách theo cú pháp GitHub:

```text
actions/checkout@*, actions/setup-node@*, trusted-vendor/security-scan@*, !compromised-owner/action@*
```

Nếu mục tiêu là deny-by-default, không bắt đầu bằng `*`. Mẫu `*, !owner/action@*` cho phép mọi dependency trừ danh sách block; nó hữu ích khi ứng phó nhanh nhưng yếu hơn allowlist cụ thể.

Các điểm cần nhớ theo GitHub Docs hiện hành:

- policy có thể cho phép action do GitHub tạo, Marketplace action từ Verified creator hoặc pattern chỉ định;
- pattern có thể giới hạn đến tag hoặc SHA;
- yêu cầu full SHA áp dụng cho action, gồm cả action nội bộ và action do GitHub tạo;
- reusable workflow vẫn có thể được tham chiếu bằng tag dù policy “Require actions…” đang bật, nên cần script audit riêng cho `jobs.<id>.uses`;
- local action bắt đầu bằng `./` hoặc `$/` không bị policy public-action giới hạn; bảo vệ chúng bằng branch rules và CODEOWNERS;
- nếu chỉ cho phép action nội bộ, `actions/checkout` cũng bị chặn trừ khi bật hoặc thêm nó vào danh sách.

Policy là guardrail ở quy mô tổ chức. Nó không thay thế source review vì action được allow vẫn có thể có commit xấu.

## Cập nhật và giám sát dependency

### Dependabot version updates cho actions

Tạo `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
    labels:
      - dependencies
      - github-actions
    open-pull-requests-limit: 10
```

Với `package-ecosystem: github-actions`, `directory` phải là `/`. Dependabot tìm workflow trong `.github/workflows` và action metadata ở root theo tài liệu cấu hình hiện hành.

Dependabot version updates hỗ trợ GitHub repository syntax cho action và reusable workflow, gồm ref dạng SHA. Khi có release mới, nó có thể mở PR đổi SHA. Giữ comment version cùng dòng:

```yaml
- uses: actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238 # v6.2.0
```

Không auto-merge PR cập nhật action nhạy cảm chỉ vì CI xanh. PR đang thay đổi mã được thực thi với quyền của pipeline; nó cần review release notes, diff source, bundle và permission.

<Callout type="warn" title="Phân biệt version updates và alerts">
  GitHub Docs hiện hành nêu Dependabot version updates có thể cập nhật action pin SHA. Tuy nhiên, Dependabot alerts cho vulnerable actions chỉ được tạo khi action dùng semantic versioning và không tạo alert cho ref pin SHA. Vì vậy, kết hợp pin SHA với version-update PR, dependency review, Advisory Database và theo dõi security advisory của publisher.
</Callout>

Nếu SHA không gắn với tag, Dependabot có thể đề xuất commit mới nhất thay vì latest release. Production nên pin commit gắn với exact release và ghi comment version để reviewer biết intent.

### Quy trình cập nhật SHA có kiểm chứng

Khi Dependabot hoặc maintainer đề xuất SHA mới, thực hiện theo thứ tự sau.

1. Xác định exact release tag cần nâng, không chỉ major tag.
2. Phân giải tag từ URL canonical của upstream.
3. Xác nhận SHA mới dài 40 ký tự và nằm trong repository đó.
4. Kiểm tra release notes, signature status và security advisory.
5. Review diff từ SHA cũ đến SHA mới, gồm `action.yml`, entrypoint, `dist`, lockfile, Dockerfile và workflow build.
6. Chạy test trong job read-only, không secret.
7. Yêu cầu CODEOWNER phê duyệt rồi mới merge.
8. Giữ SHA cũ trong lịch sử Git để rollback ngay nếu có sự cố.

Ví dụ kiểm chứng bản nâng `actions/checkout` từ `v6.0.1` lên `v6.0.2`. Hai SHA dưới đây là commit thật từ repository chính thức, không phải dữ liệu minh họa giả:

```bash
set -euo pipefail

UPSTREAM=https://github.com/actions/checkout.git
OLD_SHA=8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
TAG=v6.0.2
EXPECTED_NEW_SHA=de0fac2e4500dabe0009e67214ff5f5447ce83dd

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

git clone --quiet --filter=blob:none --no-checkout "$UPSTREAM" "$workdir/checkout"
git -C "$workdir/checkout" fetch --quiet origin "refs/tags/$TAG:refs/tags/$TAG"

resolved_sha=$(git -C "$workdir/checkout" rev-parse --verify "refs/tags/$TAG^{commit}")
if [[ ! "$resolved_sha" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Ref không phân giải thành full SHA: %s\n' "$resolved_sha" >&2
  exit 1
fi
if [[ "$resolved_sha" != "$EXPECTED_NEW_SHA" ]]; then
  printf 'SHA không khớp giá trị đang review: %s\n' "$resolved_sha" >&2
  exit 1
fi

git -C "$workdir/checkout" cat-file -e "${OLD_SHA}^{commit}"
printf 'Upstream: %s\nTag: %s\nNew SHA: %s\n' "$UPSTREAM" "$TAG" "$resolved_sha"
git -C "$workdir/checkout" log --oneline --decorate "$OLD_SHA..$resolved_sha"
git -C "$workdir/checkout" diff --stat "$OLD_SHA" "$resolved_sha"
git -C "$workdir/checkout" diff "$OLD_SHA" "$resolved_sha" -- action.yml action.yaml package.json package-lock.json Dockerfile dist/
```

Sau khi kiểm chứng, sửa đúng một ref trong pull request và giữ comment:

```yaml
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

Đối với annotated tag, `^{commit}` dereference tag object về commit. Nếu tổ chức yêu cầu chữ ký, kiểm tra trạng thái trên GitHub hoặc dùng quy trình `git verify-tag` với trust store đã quản lý. Đừng tự động coi mọi chữ ký `Verified` là đủ; reviewer vẫn phải kiểm diff.

Nếu phát hiện tag đã đổi sau thời điểm review, không thay SHA theo tag một cách im lặng. Tạm dừng cập nhật, lưu bằng chứng, liên hệ publisher và đánh giá như một sự cố chuỗi cung ứng.

### Dependency graph advisory và log

Bật dependency graph cho repository private nếu chưa bật. GitHub nhận diện action và reusable workflow trong `.github/workflows` như dependency và hiển thị owner, workflow sử dụng cùng version hoặc SHA.

Quy trình giám sát định kỳ:

- xem **Insights → Dependency graph** để kiểm kê dependency;
- bật Dependabot alerts và security updates phù hợp với repository;
- tìm GitHub Advisory Database với filter ecosystem `actions`;
- dùng dependency review trên PR thay đổi workflow;
- theo dõi release và security advisory của publisher trọng yếu;
- kiểm audit log organization/enterprise khi action policy hoặc secret thay đổi;
- ghi nhận workflow run, SHA action và artifact provenance phục vụ điều tra;
- chạy OpenSSF Scorecards hoặc CodeQL workflow scanning như lớp phát hiện bổ sung.

Nếu action bị công bố compromise:

1. chặn action bằng policy;
2. disable workflow liên quan;
3. tìm mọi ref và mọi run trong khoảng ảnh hưởng;
4. rotate token, secret và cloud credential mà job có thể truy cập;
5. thu hồi artifact hoặc release được tạo bởi run bị ảnh hưởng;
6. pin bản vá đã review hoặc thay action;
7. ghi lại timeline, SHA và bằng chứng trong incident report.

## Audit repository

### Kiểm kê nhanh bằng grep

Liệt kê mọi dòng `uses` trong workflow:

```bash
git grep -nE '^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*' -- .github/workflows
```

Tìm ref dễ thay đổi như branch hoặc tag. Đây là heuristic để review nhanh, không phải YAML parser hoàn chỉnh:

```bash
git grep -nE 'uses:[[:space:]]*["'"']?[^[:space:]#"'"']+@(main|master|HEAD|v?[0-9]+([.][0-9]+){0,2})["'"']?([[:space:]]|#|$)' -- .github/workflows
```

Tìm remote action đã pin full SHA:

```bash
git grep -nE 'uses:[[:space:]]*["'"']?[^[:space:]#"'"']+@[0-9a-fA-F]{40}(["'"']|[[:space:]]|#|$)' -- .github/workflows
```

Sau kiểm kê, tạo bảng owner/repository, SHA, version comment, workflow, job permissions, secret được truyền, reviewer và ngày review. Không chỉ đếm ref; cần biết mỗi action chạy trong trust boundary nào.

### Chặn ref không bất biến bằng script

Script Python sau dùng thư viện chuẩn, quét cả `.yml` và `.yaml`, cho phép local action, yêu cầu remote GitHub action hoặc reusable workflow dùng SHA 40 ký tự và yêu cầu Docker image dùng digest SHA-256. Nó không thay thế YAML parser, nhưng phù hợp làm guardrail đơn giản trong CI.

```bash
python3 - <<'PY'
from pathlib import Path
import re
import sys

root = Path(".github/workflows")
uses_re = re.compile(
    r"^\s*(?:-\s*)?uses:\s*['\"]?([^\s#'\"]+)",
    re.MULTILINE,
)
full_sha_re = re.compile(r"^[0-9a-fA-F]{40}$")
docker_digest_re = re.compile(r"^docker://.+@sha256:[0-9a-fA-F]{64}$")

failures = []
found = 0
for path in sorted([*root.rglob("*.yml"), *root.rglob("*.yaml")]):
    text = path.read_text(encoding="utf-8")
    for match in uses_re.finditer(text):
        found += 1
        ref = match.group(1)
        line = text.count("\n", 0, match.start()) + 1

        if ref.startswith(("./", "$/")):
            continue

        if ref.startswith("docker://"):
            if not docker_digest_re.fullmatch(ref):
                failures.append((path, line, ref, "Docker image chưa pin sha256 digest"))
            continue

        if "@" not in ref:
            failures.append((path, line, ref, "Thiếu @ref"))
            continue

        _, git_ref = ref.rsplit("@", 1)
        if not full_sha_re.fullmatch(git_ref):
            failures.append((path, line, ref, "Ref không phải full commit SHA 40 ký tự"))

print(f"Đã kiểm tra {found} tham chiếu uses")
for path, line, ref, reason in failures:
    print(f"{path}:{line}: {reason}: {ref}", file=sys.stderr)

if failures:
    sys.exit(1)
PY
```

Giới hạn cần hiểu:

- script không xác minh SHA thuộc repository canonical;
- script không audit nested action bên trong composite action bên ngoài;
- script không kiểm code tải động qua `curl`, package manager hoặc image base;
- script không đánh giá local action;
- policy “Require full SHA” của GitHub vẫn nên bật để có enforcement phía nền tảng.

Với quy mô lớn, bổ sung allowlist `OWNER/REPOSITORY`, exception có ngày hết hạn và báo cáo inventory. Không để team tự thêm exception ngay trong cùng PR mà không có security reviewer.

### Bảo vệ thay đổi bằng CODEOWNERS

Thêm workflow, Dependabot config và local action vào phạm vi security review:

```text
# .github/CODEOWNERS
/.github/workflows/       @ORG/platform-security
/.github/actions/         @ORG/platform-security
/.github/dependabot.yml   @ORG/platform-security
```

CODEOWNERS chỉ yêu cầu review khi branch protection hoặc ruleset bật **Require review from Code Owners**. Kết hợp với:

- protected default branch;
- cấm bypass cho thay đổi workflow nhạy cảm;
- required status check chạy script audit;
- ít nhất hai reviewer cho action có quyền ghi, OIDC hoặc production secret;
- signed commit nếu chính sách tổ chức yêu cầu;
- giới hạn người có quyền sửa Actions policy và organization secrets.

## Bài thực hành

Mục tiêu của bài là thêm một policy check có thể chạy, quan sát nó chặn tag mutable và xác nhận workflow hợp lệ khi dùng full SHA chính thức.

### Chuẩn bị

Bạn cần:

- repository thử nghiệm có GitHub Actions;
- quyền tạo branch và pull request;
- Python 3 trên runner `ubuntu-latest`;
- không dùng production secret trong bài;
- Actions policy cho phép `actions/checkout` tại SHA được dùng bên dưới.

Tạo branch:

```bash
git switch -c harden/action-references
mkdir -p .github/workflows
```

### Triển khai policy check

Tạo `.github/workflows/audit-action-refs.yml` với nội dung sau:

```yaml
name: Audit action references

on:
  pull_request:
    paths:
      - ".github/workflows/**"
      - ".github/actions/**"
      - ".github/dependabot.yml"
  workflow_dispatch:

permissions: {}

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false

      - name: Require immutable action references
        shell: bash
        run: |
          python3 - <<'PY'
          from pathlib import Path
          import re
          import sys

          uses_re = re.compile(
              r"^\s*(?:-\s*)?uses:\s*['\"]?([^\s#'\"]+)",
              re.MULTILINE,
          )
          full_sha = re.compile(r"^[0-9a-fA-F]{40}$")
          docker_digest = re.compile(r"^docker://.+@sha256:[0-9a-fA-F]{64}$")
          failures = []

          root = Path(".github/workflows")
          paths = sorted([*root.rglob("*.yml"), *root.rglob("*.yaml")])
          for path in paths:
              text = path.read_text(encoding="utf-8")
              for match in uses_re.finditer(text):
                  ref = match.group(1)
                  line = text.count("\n", 0, match.start()) + 1
                  if ref.startswith(("./", "$/")):
                      continue
                  if ref.startswith("docker://"):
                      if not docker_digest.fullmatch(ref):
                          failures.append((path, line, ref, "Docker ref phải dùng sha256 digest"))
                      continue
                  if "@" not in ref or not full_sha.fullmatch(ref.rsplit("@", 1)[1]):
                      failures.append((path, line, ref, "GitHub ref phải là full SHA 40 ký tự"))

          for path, line, ref, reason in failures:
              print(f"::error file={path},line={line}::{reason}: {ref}")
          if failures:
              sys.exit(1)
          print("Tất cả remote uses refs đều bất biến")
          PY
```

Commit và push:

```bash
git add .github/workflows/audit-action-refs.yml
git commit -m "ci: enforce immutable action references"
git push -u origin harden/action-references
```

Mở pull request và đặt job `Audit action references / audit` làm required check sau khi đã xác nhận workflow chạy đúng.

### Tình huống kiểm thử

**Ca 1 — ref mutable phải thất bại**

Trong một workflow thử nghiệm, thêm tạm:

```yaml
- uses: actions/setup-node@v6
```

Policy check phải báo `GitHub ref phải là full SHA 40 ký tự`.

**Ca 2 — SHA chính thức phải thành công**

Thay dòng trên bằng exact release chính thức:

```yaml
- uses: actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238 # v6.2.0
```

Policy check phải thành công.

**Ca 3 — local action được phép nhưng vẫn cần review**

```yaml
- uses: ./.github/actions/internal-check
```

Script bỏ qua ref local vì nó thuộc cùng commit. Xác nhận CODEOWNERS bao phủ `.github/actions/` để local action không trở thành đường vòng policy.

**Ca 4 — Docker tag mutable phải thất bại**

```yaml
- uses: docker://alpine:3.22
```

Script yêu cầu digest `sha256`, vì tag container cũng có thể bị thay đổi.

Sau thử nghiệm, xóa các dòng cố ý vi phạm trước khi merge.

### Tiêu chí kiểm chứng

- [ ] Workflow audit dùng `permissions: {}` ở cấp workflow và chỉ `contents: read` ở job.
- [ ] `actions/checkout` được pin bằng full SHA 40 ký tự và có comment exact version.
- [ ] Ref `@v6` làm required check thất bại với annotation đúng file và dòng.
- [ ] Ref full SHA chính thức làm check thành công.
- [ ] Docker tag bị chặn; Docker digest hợp lệ được chấp nhận.
- [ ] Local action không bị script chặn nhưng nằm trong CODEOWNERS.
- [ ] Dependabot `github-actions` đã được cấu hình để tạo PR cập nhật.
- [ ] Organization hoặc enterprise policy yêu cầu full SHA đã được bật nếu gói GitHub hỗ trợ cài đặt đó.
- [ ] Team đã ghi quy trình xác minh SHA và rollback vào runbook nội bộ.

## Checklist và best practices

### Checklist phê duyệt action mới

**Publisher**

- [ ] Repository canonical được liên kết từ nguồn chính thức.
- [ ] Owner và lịch sử ownership không có dấu hiệu giả mạo hoặc chuyển giao bất thường.
- [ ] Có `SECURITY.md` hoặc kênh báo cáo lỗ hổng.
- [ ] Verified creator, số sao và lượt dùng chỉ được ghi như tín hiệu hỗ trợ.

**Repository và release**

- [ ] Đã đọc `action.yml` hoặc `action.yaml` ở đúng commit.
- [ ] Đã review `pre`, `main`, `post`, composite steps hoặc Docker entrypoint.
- [ ] Đã review network destinations, telemetry và download lúc runtime.
- [ ] Đã review lockfile, transitive dependency, base image và binary vendored.
- [ ] Exact release tag được phân giải từ repository canonical.
- [ ] Full SHA dài 40 ký tự và không đến từ fork.
- [ ] Release notes, diff và signature status đã được kiểm tra.
- [ ] Source và `dist` hoặc container artifact khớp theo quy trình build công bố.

**Workflow và blast radius**

- [ ] Job đặt `permissions` tối thiểu; không dùng `write-all`.
- [ ] Chỉ secret bắt buộc được truyền tường minh.
- [ ] Action không chạy cùng job với production secret nếu không thật sự cần.
- [ ] Input từ PR, issue, artifact và output action được validate.
- [ ] Self-hosted runner là ephemeral, sạch và thuộc runner group phù hợp.
- [ ] Environment approval bảo vệ job production.

**Vận hành**

- [ ] Dependabot version updates đã bật cho `github-actions`.
- [ ] CODEOWNERS và required check bảo vệ workflow.
- [ ] Action nằm trong allowlist organization hoặc enterprise.
- [ ] Có owner nội bộ, lịch review lại và kế hoạch thay thế.
- [ ] Có SHA cũ để rollback và runbook xử lý compromise.

### Best practices khi vận hành

- **Deny by default.** Chỉ allow repository đã review thay vì cho phép mọi action rồi block từng trường hợp.
- **Pin full SHA ở mọi nơi.** Áp dụng cả action do GitHub tạo và external reusable workflow, không chỉ Marketplace action.
- **Ghi exact version cùng dòng.** Comment như `# v6.0.2` giúp review và Dependabot cập nhật tài liệu version.
- **Review code thực thi.** Với JavaScript action, review `dist`; với Docker action, review image digest và entrypoint.
- **Giảm quyền trước khi tăng niềm tin.** Action phổ biến vẫn chỉ nhận permission và secret tối thiểu.
- **Tách build khỏi deploy.** Job phân tích hoặc build không cần credential production; job deploy chỉ nhận artifact đã kiểm chứng.
- **Validate mọi ranh giới dữ liệu.** Input, output, artifact, cache, file path và URL đều có thể do attacker kiểm soát.
- **Theo dõi lifecycle đầy đủ.** Review cả pre và post step, không chỉ tên step chính.
- **Cập nhật qua pull request.** Không đổi SHA trực tiếp trên default branch và không auto-merge dependency nhạy cảm.
- **Ưu tiên OIDC và token ngắn hạn.** Nếu credential bị lộ, thời gian và phạm vi sử dụng phải nhỏ.
- **Làm sạch self-hosted runner.** Dùng runner một lần hoặc image tái tạo; không xem cleanup script của chính action là ranh giới an toàn.
- **Review định kỳ.** Action từng an toàn có thể đổi maintainer, dependency, cách build hoặc mô hình phát hành.

### Anti-patterns cần tránh

| Anti-pattern | Vì sao nguy hiểm | Thay thế |
|---|---|---|
| `uses: owner/action@main` | hành vi đổi theo mọi commit | pin full SHA của exact release |
| `uses: owner/action@v1` | major tag có thể bị retarget | pin SHA và dùng Dependabot |
| Tin tuyệt đối vào Verified creator | badge xác minh danh tính, không audit code | đánh giá publisher, source, release và quyền |
| Truyền `secrets: inherit` mặc định | mở rộng secret không cần thiết | ánh xạ từng secret |
| `permissions: write-all` | compromise có blast radius lớn | cấp scope ở cấp job |
| Chỉ review `src/` | runner có thể chạy `dist` khác source | review entrypoint và build artifact |
| Nội suy output vào `run` | output độc hại có thể thành source shell | đưa qua `env`, quote và validate |
| Dùng cùng job cho scan và deploy | action scan thấy token hoặc secret deploy | tách job và environment |
| Pin repository SHA nhưng tải `latest` lúc chạy | dependency runtime vẫn mutable | pin checksum hoặc digest |
| Auto-merge mọi Dependabot PR | mỗi PR thay code được thực thi | security review và test cô lập |
| Chỉ dùng blocklist | action mới mặc định được phép | allowlist cụ thể, exception có hạn |
| Tin rằng Docker action là sandbox | workspace và credential vẫn được mount hoặc truyền | coi container là cùng trust boundary |

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| Workflow báo action không được phép | owner/repository/ref không nằm trong Actions policy hoặc enterprise policy ghi đè | xem Organization/Enterprise Actions policy; thêm đúng repository hoặc SHA đã phê duyệt |
| Workflow báo action phải pin full SHA | đang dùng tag, branch, SHA rút gọn hoặc action lồng trong composite dùng ref mutable | thay bằng SHA 40 ký tự; audit cả nested `uses` |
| Reusable workflow dùng tag vẫn chạy dù đã bật require SHA | GitHub policy “Require actions…” áp dụng cho action; reusable workflow vẫn có thể dùng tag | thêm CI script kiểm mọi remote `uses`, gồm `jobs.<id>.uses` |
| Dependabot không tạo PR cho action | thiếu ecosystem `github-actions`, `directory` không phải `/`, ref local, Docker URL không được hỗ trợ hoặc update đang bị giới hạn | sửa `.github/dependabot.yml`; kiểm open PR limit và log Dependabot |
| Dependabot đề xuất commit không phải release mong muốn | SHA hiện tại không gắn tag | pin commit của exact release và giữ comment version cùng dòng |
| Không có Dependabot alert cho action pin SHA | theo GitHub Docs, vulnerable-action alert dựa trên semantic versioning và không tạo cho SHA | theo dõi version-update PR, Advisory Database, dependency review và advisory upstream |
| SHA từ tag không khớp PR cập nhật | tag bị di chuyển, PR lấy sai repository hoặc comment version sai | dừng merge; phân giải tag từ URL canonical, kiểm release và điều tra retarget |
| `git verify-tag` thất bại | lightweight tag, thiếu public key/trust config hoặc chữ ký không hợp lệ | kiểm loại tag; thiết lập trust store; đối chiếu trạng thái trên GitHub và policy nội bộ |
| Bundle build lại khác `dist` | build không tái lập, toolchain khác hoặc bundle đã bị sửa | dùng version toolchain chính xác; so sánh lockfile và workflow release; không phê duyệt khi chưa giải thích được |
| Job không truyền token nhưng action vẫn gọi API được | action dùng `github.token` | hạ `permissions` của job xuống `{}` hoặc scope read cần thiết |
| Secret xuất hiện trong log | action hoặc tool biến đổi/in secret nên redaction không bắt được | disable workflow, xóa log nếu cần, rotate secret và audit mọi run bị ảnh hưởng |
| Output hợp lệ trong log nhưng step sau chạy lệnh lạ | output được nội suy trực tiếp vào shell hoặc dùng `eval` | chuyển qua `env`, quote, validate allowlist và loại bỏ `eval` |
| Post step chạy dù step chính thất bại | `post-if` mặc định là `always()` | review metadata; đặt trust boundary phù hợp hoặc thay action |
| Action pin SHA vẫn tải code mới | action tải dependency runtime qua URL, package tag hoặc container tag mutable | pin digest/checksum, chặn egress hoặc thay action có build tự chứa |
| Tách job nhưng vẫn lo rò dữ liệu trên self-hosted runner | runner không ephemeral hoặc nhiều repository dùng chung máy | dùng JIT/ephemeral runner, runner group riêng và image sạch cho mỗi job |
| Local action vượt qua allowlist | policy public action không giới hạn path `./` hoặc `$/` | bảo vệ `.github/actions` bằng CODEOWNERS, ruleset và source review |

## Tài liệu tham khảo

Nguồn được ưu tiên là tài liệu chính thức, truy cập và đối chiếu theo giao diện GitHub Docs hiện hành năm 2026:

- [GitHub Docs — Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Docs — Use GITHUB_TOKEN for authentication in workflows](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)
- [GitHub Docs — Using pre-written building blocks in your workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/find-and-customize-actions)
- [GitHub Docs — Metadata syntax reference](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)
- [GitHub Docs — Workflow commands for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- [GitHub Docs — Keeping your actions up to date with Dependabot](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/auto-update-actions)
- [GitHub Docs — Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [GitHub Docs — Dependency graph](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-graph)
- [GitHub Docs — Disabling or limiting GitHub Actions for your organization](https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization)
- [GitHub Docs — Enforcing policies for GitHub Actions in your enterprise](https://docs.github.com/en/enterprise-cloud@latest/admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-policies-for-github-actions-in-your-enterprise)
- [GitHub Docs — Reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [GitHub Docs — About commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)
- [GitHub Security Lab — Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/)
- [OpenSSF Scorecard — Security health metrics for open source](https://github.com/ossf/scorecard)
