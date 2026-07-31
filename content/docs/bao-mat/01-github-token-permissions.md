---
title: "GITHUB_TOKEN và mô hình permissions"
description: "Hiểu vòng đời GITHUB_TOKEN, thiết kế quyền tối thiểu theo từng job và kiểm chứng workflow GitHub Actions bằng các thử nghiệm âm an toàn."
---

<Callout type="warn" title="Token tự động vẫn là credential đặc quyền">
  GitHub tạo `GITHUB_TOKEN` tự động, nhưng mọi action và lệnh trong job đều có thể dùng token đó qua `github.token`. Đừng dựa vào việc “không truyền token trong `with`”. Hãy giới hạn khả năng của token bằng `permissions` trước khi chạy code.
</Callout>

## Mục lục

- [Mô hình tinh thần](#mô-hình-tinh-thần)
- [Nguồn gốc và vòng đời của GITHUB_TOKEN](#nguồn-gốc-và-vòng-đời-của-github_token)
  - [Token đến từ đâu](#token-đến-từ-đâu)
  - [Phạm vi repository và job](#phạm-vi-repository-và-job)
  - [Hết hạn và chống vòng lặp workflow](#hết-hạn-và-chống-vòng-lặp-workflow)
- [Cách permissions được tính](#cách-permissions-được-tính)
  - [Default permissions không phải một hằng số](#default-permissions-không-phải-một-hằng-số)
  - [Thứ tự áp dụng quyền](#thứ-tự-áp-dụng-quyền)
  - [Deny by default với permissions rỗng](#deny-by-default-với-permissions-rỗng)
  - [Quyền cấp workflow và quyền cấp job](#quyền-cấp-workflow-và-quyền-cấp-job)
- [Các permission scope thường dùng](#các-permission-scope-thường-dùng)
- [Mô hình đe dọa](#mô-hình-đe-dọa)
  - [Ai có thể lấy hoặc lạm dụng token](#ai-có-thể-lấy-hoặc-lạm-dụng-token)
  - [Một token bị chiếm có thể gây gì](#một-token-bị-chiếm-có-thể-gây-gì)
- [Pull request từ fork](#pull-request-từ-fork)
  - [pull_request cho kiểm thử code không tin cậy](#pull_request-cho-kiểm-thử-code-không-tin-cậy)
  - [pull_request_target chỉ cho tác vụ trên metadata](#pull_request_target-chỉ-cho-tác-vụ-trên-metadata)
- [Reusable workflows và chuỗi quyền](#reusable-workflows-và-chuỗi-quyền)
- [Hai workflow mẫu](#hai-workflow-mẫu)
  - [Workflow CI chỉ đọc](#workflow-ci-chỉ-đọc)
  - [Workflow tạo GitHub Release](#workflow-tạo-github-release)
- [Khi GITHUB_TOKEN không đủ](#khi-github_token-không-đủ)
  - [Ưu tiên GitHub App](#ưu-tiên-github-app)
  - [PAT và OIDC dùng cho bài toán khác](#pat-và-oidc-dùng-cho-bài-toán-khác)
- [Audit và kiểm thử quyền](#audit-và-kiểm-thử-quyền)
  - [Review tĩnh workflow](#review-tĩnh-workflow)
  - [Xác nhận quyền hiệu lực của một run](#xác-nhận-quyền-hiệu-lực-của-một-run)
  - [Kiểm thử permission failure](#kiểm-thử-permission-failure)
- [Bài thực hành](#bài-thực-hành)
  - [Chuẩn bị](#chuẩn-bị)
  - [Workflow phòng lab](#workflow-phòng-lab)
  - [Chạy và tiêu chí hoàn thành](#chạy-và-tiêu-chí-hoàn-thành)
- [Best practices cho production](#best-practices-cho-production)
- [Troubleshooting](#troubleshooting)
- [Bài bảo mật liên quan](#bài-bảo-mật-liên-quan)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Mô hình tinh thần

`GITHUB_TOKEN` là installation access token ngắn hạn của GitHub App mà GitHub Actions cài trên repository. **Permission scope** là một nhóm quyền đối với một loại tài nguyên, chẳng hạn `contents`, `issues` hoặc `packages`.

Luồng cấp quyền có thể hình dung như sau:

```text
Default từ enterprise / organization / repository
                         ↓
              permissions ở workflow
                         ↓
                permissions ở job
                         ↓
       Giới hạn bổ sung theo event, ví dụ fork PR
                         ↓
       Token riêng cho job, chỉ dùng với repository đó
```

Hai câu hỏi cần tách biệt:

1. **Token có quyền gì?** `permissions` trả lời bằng `read`, `write` hoặc `none`.
2. **Code nào được chạy cùng token?** Trigger, action, script và runner quyết định ai có cơ hội sử dụng quyền đó.

Một token quyền tối thiểu không làm code không tin cậy trở thành an toàn. Tuy nhiên, nó giới hạn thiệt hại nếu code bị chiếm quyền.

## Nguồn gốc và vòng đời của GITHUB_TOKEN

### Token đến từ đâu

Khi bật GitHub Actions, GitHub cài một GitHub App trên repository. Trước khi **mỗi job** bắt đầu, GitHub lấy một installation access token mới cho App này và đưa nó vào job dưới hai dạng tương đương:

- `${{ secrets.GITHUB_TOKEN }}`;
- `${{ github.token }}`.

Bạn không tạo token này trong **Settings → Secrets and variables → Actions**. Bạn cũng không rotate nó thủ công. Dù không truyền `${{ secrets.GITHUB_TOKEN }}` cho một action, action vẫn có thể đọc `github.token`. Vì vậy, `permissions` mới là lớp kiểm soát chính.

Ví dụ, GitHub CLI nhận token qua biến `GH_TOKEN`:

```yaml
- name: Đọc thông tin commit hiện tại
  env:
    GH_TOKEN: ${{ github.token }}
  run: gh api "repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}" --jq .sha
```

### Phạm vi repository và job

Token được giới hạn vào repository chứa workflow. Nó không trở thành credential truy cập có xác thực tới một private repository khác chỉ vì hai repository cùng organization.

Mỗi job nhận token riêng và permission riêng. Hai job trong cùng một run không nên chuyền token cho nhau qua output, artifact hoặc cache. Hãy cấp quyền trực tiếp cho từng job:

```yaml
permissions: {}

jobs:
  test:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - run: echo "Job test chỉ được đọc contents."

  report:
    permissions:
      checks: write
    runs-on: ubuntu-latest
    steps:
      - run: echo "Job report chỉ làm việc với checks."
```

`contents: read` ở job `test` không truyền sang `report`. Ngược lại, `checks: write` ở `report` không cấp quyền sửa source code.

<Callout type="info" title="Public resource không đồng nghĩa token có phạm vi rộng">
  Một API công khai có thể cho phép đọc ẩn danh repository public. Đó không phải là `GITHUB_TOKEN` được cấp quyền cross-repository. Với private repository, package hoặc tài nguyên organization khác, hãy cấu hình GitHub App hay credential phù hợp.
</Callout>

### Hết hạn và chống vòng lặp workflow

Token hết hiệu lực khi job kết thúc hoặc khi đạt giới hạn vòng đời hiệu lực. Trên GitHub-hosted runner, job chạy tối đa 6 giờ nên token cũng tồn tại tối đa 6 giờ. Trên self-hosted runner, job có thể chạy lâu hơn, nhưng installation token chỉ được refresh tối đa 24 giờ. Job dài hơn cần một cơ chế xác thực khác.

Token ngắn hạn giảm cửa sổ khai thác sau khi lộ. Nó không bảo vệ các thao tác diễn ra ngay trong job. Một action độc hại vẫn có thể dùng token trước khi job kết thúc.

Để tránh vòng lặp, phần lớn sự kiện do thao tác bằng `GITHUB_TOKEN` tạo ra sẽ không khởi động workflow mới. `workflow_dispatch` và `repository_dispatch` là ngoại lệ. Theo hành vi hiện hành, pull request do `GITHUB_TOKEN` tạo hoặc cập nhật có thể tạo các run `pull_request` ở trạng thái chờ người có quyền ghi phê duyệt. Nếu automation bắt buộc phải kích hoạt chuỗi workflow không bị cơ chế này chặn, hãy dùng GitHub App sau khi đánh giá rủi ro.

## Cách permissions được tính

### Default permissions không phải một hằng số

Không nên đoán default từ việc repository là public hay private. Trạng thái hiện hành phụ thuộc thời điểm tạo repository và chính sách cấp trên.

| Trường hợp | Default cần kỳ vọng | Điều cần kiểm tra |
|---|---|---|
| Repository mới trong personal account, public hoặc private | `contents: read` và `packages: read`; các quyền còn lại bị hạn chế | **Repository → Settings → Actions → General → Workflow permissions** |
| Repository mới trong organization | Kế thừa lựa chọn của organization | Cả organization và repository settings |
| Repository cũ hoặc đã đổi cấu hình | Có thể đang dùng lựa chọn permissive “Read and write permissions” | Không suy luận từ visibility; đọc settings thực tế |
| Organization thuộc enterprise | Enterprise có thể ép lựa chọn chặt hơn và khóa tùy chọn permissive | Enterprise policy, rồi organization và repository |
| Pull request từ public fork | Token bị giới hạn chỉ đọc và stored secrets không được cấp | Event, actor và log “GITHUB_TOKEN Permissions” |
| Pull request từ private fork | Mặc định an toàn là chỉ đọc, không secrets; admin có các policy riêng để cho chạy, gửi write token hoặc gửi secrets | **Fork pull request workflows** ở organization/repository |

Default chỉ là điểm khởi đầu. Nó không thay thế việc khai báo quyền rõ trong YAML. Người có quyền sửa workflow có thể đề xuất thêm quyền; hãy bảo vệ `.github/workflows/` bằng branch protection và `CODEOWNERS`.

### Thứ tự áp dụng quyền

GitHub tính quyền của job theo thứ tự:

1. lấy default ở enterprise, organization và repository;
2. áp dụng `permissions` cấp workflow nếu có;
3. áp dụng `jobs.<job_id>.permissions` cho job cụ thể nếu có;
4. với fork pull request, chuyển các quyền ghi thành chỉ đọc nếu policy không cho gửi write token.

Khi một map `permissions` liệt kê ít nhất một scope, mọi scope không liệt kê được đặt thành `none`. Ví dụ sau **không** giữ default của `issues` hay `packages`:

```yaml
permissions:
  contents: read
```

`write` bao gồm `read` đối với các scope hỗ trợ cả hai mức. Riêng `id-token` chỉ nhận `write` hoặc `none`; tên `write` ở đây có nghĩa “được yêu cầu OIDC token”, không phải được ghi vào identity provider.

### Deny by default với permissions rỗng

Mẫu an toàn nhất cho workflow nhiều job là tắt toàn bộ quyền ở cấp workflow, rồi mở đúng quyền tại job cần dùng:

```yaml
permissions: {}

jobs:
  lint:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - run: echo "Chỉ job lint có quyền đọc repository."

  notify:
    permissions:
      issues: write
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "Job notify không có contents: read."'
```

Đây là **deny by default**: quyền bị từ chối trừ khi được cho phép rõ. Cách này cũng làm reviewer nhìn thấy nơi privilege được mở.

Tránh `permissions: write-all`. `permissions: read-all` tốt hơn `write-all`, nhưng vẫn tự động cấp quyền đọc cho mọi scope hiện có. Danh sách tường minh thường dễ audit hơn.

### Quyền cấp workflow và quyền cấp job

Dùng quyền cấp workflow khi mọi job thật sự cần cùng một tập quyền nhỏ:

```yaml
permissions:
  contents: read
```

Dùng quyền cấp job khi chỉ một phần pipeline cần đặc quyền:

```yaml
permissions: {}

jobs:
  build:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - run: echo "Build không thể tạo release."

  release:
    needs: build
    permissions:
      contents: write
    runs-on: ubuntu-latest
    steps:
      - run: echo "Chỉ job này có thể tạo release."
```

Không thể đặt `permissions` cho riêng một step. Mọi step và action trong cùng job chia sẻ khả năng của token. Nếu chỉ một step cần quyền ghi, hãy tách step đó thành job ngắn, không chạy code không tin cậy và chỉ chứa dependency đã review.

## Các permission scope thường dùng

Bảng này tập trung vào scope thường gặp. Danh sách có thể phát triển theo GitHub.com hoặc phiên bản GitHub Enterprise Server, nên luôn đối chiếu workflow syntax chính thức trước khi dùng scope mới.

| Scope | `read` thường cho phép | `write` thường cho phép | Ví dụ sử dụng |
|---|---|---|---|
| `contents` | Đọc commit, branch và nội dung repository | Push commit/tag, tạo hoặc cập nhật release | Checkout source, phát hành GitHub Release |
| `pull-requests` | Đọc PR | Cập nhật PR, label hoặc review theo API tương ứng | Bot quản lý PR |
| `issues` | Đọc issue và comment | Tạo, sửa, đóng issue/comment | Bot triage, báo lỗi tự động |
| `checks` | Đọc check run/suite | Tạo và cập nhật check run | Công cụ test report |
| `statuses` | Đọc commit status | Tạo commit status | Tích hợp CI dùng Status API |
| `actions` | Đọc run, artifact và metadata Actions theo endpoint | Quản lý run/artifact, ví dụ hủy run | Công cụ vận hành Actions |
| `packages` | Tải package mà repository được phép truy cập | Publish hoặc xóa package theo chính sách package | Publish GHCR/npm package |
| `deployments` | Đọc deployment | Tạo deployment và trạng thái deployment | CD và environment dashboard |
| `pages` | Đọc cấu hình liên quan | Yêu cầu GitHub Pages build/deploy | Deploy Pages |
| `attestations` | Đọc attestation nếu endpoint hỗ trợ | Tạo artifact attestation | Chứng thực provenance của build |
| `security-events` | Đọc code scanning alerts | Cập nhật code scanning alert hoặc upload kết quả phù hợp | CodeQL/SARIF workflow |
| `id-token` | Không có mức `read` | Yêu cầu OIDC JSON Web Token | Đổi lấy cloud credential ngắn hạn |

Một số cặp dễ nhầm:

- `checks` và `statuses` là hai API khác nhau. Hãy xem tool gọi endpoint nào thay vì cấp cả hai “cho chắc”.
- `pull-requests: write` không tự cấp `contents: write`.
- `contents: write` là quyền mạnh: ngoài release, nó có thể sửa ref và source theo API cho phép.
- `security-events` không bao phủ mọi loại security alert. Secret scanning và một số API bảo mật có thể cần GitHub App hoặc PAT với permission riêng.
- `id-token: write` chỉ mở endpoint OIDC. Quyền cloud thực tế vẫn do trust policy và role phía cloud quyết định.

<Callout type="warn" title="Scope là khả năng, không phải ý định">
  Nếu job có `contents: write` chỉ để tạo release, action bị chiếm quyền vẫn có thể thử sửa tag hoặc branch. Hãy kết hợp permission tối thiểu với protected branches, environment approval, action pinning và job tách biệt.
</Callout>

## Mô hình đe dọa

### Ai có thể lấy hoặc lạm dụng token

Hãy xem mọi code chạy trong job là principal có thể dùng token:

- action bên thứ ba, kể cả khi workflow không truyền token tường minh;
- local action và script trong repository;
- dependency cài trong bước build, chẳng hạn lifecycle script của npm;
- dữ liệu do attacker kiểm soát bị chèn trực tiếp vào `run`;
- code từ pull request hoặc artifact/cache do workflow không tin cậy tạo;
- tiến trình khác trên self-hosted runner bị dùng lại hoặc không cô lập tốt.

Ví dụ nguy hiểm sau đưa tiêu đề PR vào mã Bash trước khi shell thực thi:

```yaml
- run: echo "${{ github.event.pull_request.title }}"
```

Kẻ tấn công có thể đặt tiêu đề chứa cú pháp shell. Mẫu an toàn hơn đưa dữ liệu vào biến môi trường và quote biến:

```yaml
- name: Kiểm tra tiêu đề như dữ liệu
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  shell: bash
  run: printf '%s\n' "$PR_TITLE" | ./scripts/check-title.sh
```

Tuy vậy, `./scripts/check-title.sh` vẫn phải là code tin cậy nếu job có quyền ghi.

### Một token bị chiếm có thể gây gì

Mức tác động phụ thuộc scope:

| Quyền bị chiếm | Tác động điển hình |
|---|---|
| `contents: read` trên private repository | Lấy source code và dữ liệu có trong Git history |
| `contents: write` | Sửa ref, tag hoặc release; có thể đầu độc chuỗi cung ứng |
| `packages: write` | Publish phiên bản package hoặc image độc hại |
| `pull-requests: write` / `issues: write` | Spam, sửa metadata, giả mạo thông báo automation |
| `actions: write` | Can thiệp workflow run hoặc artifact theo endpoint được phép |
| `id-token: write` với trust policy cloud quá rộng | Đổi OIDC token lấy role cloud có đặc quyền |

Token hết hạn không hoàn tác commit, package, release hay cloud credential đã tạo. Khi điều tra sự cố, phải thu hồi hoặc xóa tác động ở hệ thống đích, không chỉ hủy job.

## Pull request từ fork

### pull_request cho kiểm thử code không tin cậy

Với `pull_request` từ public fork, GitHub không cấp stored secrets và hạ `GITHUB_TOKEN` xuống chỉ đọc. Một số contributor còn cần maintainer phê duyệt trước khi workflow chạy. Đây là trigger phù hợp cho build, lint và test code từ PR.

```yaml
name: Fork-safe CI

on:
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Không publish, không deploy, không dùng production secret."
```

Approval cho phép workflow bắt đầu; approval **không biến code thành tin cậy** và không nên được hiểu là cấp write token. Với private fork, organization/repository có policy để gửi write token hoặc secrets. Chỉ bật khi đã hiểu rằng code trong PR có thể đọc và gửi chúng ra ngoài.

### pull_request_target chỉ cho tác vụ trên metadata

`pull_request_target` chạy workflow từ ngữ cảnh nhánh đích, không phải merge commit của PR. Nó có thể nhận secrets được tham chiếu và `GITHUB_TOKEN` có ngữ cảnh đặc quyền, kể cả PR đến từ public fork. Trigger này phù hợp cho thao tác metadata như gắn nhãn hoặc comment bằng code nằm trên base branch.

<Callout type="error" title="Không checkout rồi chạy PR head trong pull_request_target">
  Đừng checkout `${{ github.event.pull_request.head.sha }}`, chạy script từ PR, cài dependency của PR hoặc nạp artifact/cache không tin cậy trong job `pull_request_target` có token ghi. Đây là mẫu “pwn request” có thể dẫn tới chiếm repository và secrets.
</Callout>

Nếu buộc phải dùng trigger này, khai báo scope chính xác và chỉ xử lý dữ liệu như dữ liệu:

```yaml
name: PR metadata only

on:
  pull_request_target:
    types: [opened]

permissions: {}

jobs:
  inspect-metadata:
    permissions:
      pull-requests: read
    runs-on: ubuntu-latest
    steps:
      - name: Đọc số PR, không checkout code
        env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: printf 'Inspecting PR %s\n' "$PR_NUMBER"
```

Nói ngắn gọn: dùng `pull_request` để chạy code PR; chỉ cân nhắc `pull_request_target` cho metadata và không thực thi nội dung PR.

## Reusable workflows và chuỗi quyền

Reusable workflow là workflow có trigger `workflow_call` và được workflow khác gọi ở cấp job. Trong called workflow, `github` context gắn với **caller**. `github.token` và `secrets.GITHUB_TOKEN` cũng đại diện cho token của repository caller, không phải một credential rộng cho repository lưu reusable workflow.

Caller nên đặt quyền ngay tại job gọi:

```yaml
permissions: {}

jobs:
  call-ci:
    permissions:
      contents: read
    uses: octo-org/automation/.github/workflows/ci.yml@172239021f7ba04fe7327647b213799853a9eb89
```

Quyền trong chuỗi nested workflows chỉ có thể được giữ nguyên hoặc giảm, không thể tăng. Nếu A gọi B gọi C với `contents: read`, B hoặc C không thể biến nó thành `contents: write`.

Điều này tạo ra ba quy tắc thực hành:

1. caller cấp đúng permission contract mà called workflow cần;
2. called workflow không yêu cầu caller dùng `write-all` để tránh thiết kế contract;
3. pin reusable workflow ngoài repository bằng full commit SHA, vì code được gọi sẽ chạy với token của caller.

Secrets thường chỉ truyền đến workflow được gọi trực tiếp. Riêng `GITHUB_TOKEN` được GitHub cấp tự động theo caller context; không tạo PAT chỉ để “truyền token” cho reusable workflow.

## Hai workflow mẫu

### Workflow CI chỉ đọc

Workflow sau checkout source để chạy Node.js CI. Token không được lưu vào Git config vì `persist-credentials: false`. SHA của `actions/checkout` được pin để tránh tag bị di chuyển.

```yaml
name: Read-only CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout source
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Install and test
        shell: bash
        run: |
          set -euo pipefail
          npm ci
          npm test
```

Nếu project không dùng Node.js, thay hai lệnh cuối bằng lệnh build/test tương ứng. Giữ `contents: read` và không thêm quyền ghi chỉ để xử lý lỗi checkout.

### Workflow tạo GitHub Release

Workflow sau chỉ chạy khi push tag dạng `v*`. Nó dùng GitHub CLI có sẵn trên GitHub-hosted runner, tải archive đúng `GITHUB_SHA`, rồi tạo release. Không có PAT hay secret thật nào trong YAML.

```yaml
name: Publish GitHub Release

on:
  push:
    tags:
      - 'v*'

permissions: {}

jobs:
  release:
    permissions:
      contents: write
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Download source archive for the tagged commit
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          archive="${RUNNER_TEMP}/${GITHUB_REPOSITORY#*/}-${GITHUB_REF_NAME}.tar.gz"
          gh api \
            -H 'Accept: application/vnd.github+json' \
            "repos/${GITHUB_REPOSITORY}/tarball/${GITHUB_SHA}" > "$archive"
          printf 'ARCHIVE=%s\n' "$archive" >> "$GITHUB_ENV"

      - name: Create release for the existing tag
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          gh release create "$GITHUB_REF_NAME" \
            "$ARCHIVE#Source archive" \
            --repo "$GITHUB_REPOSITORY" \
            --verify-tag \
            --generate-notes
```

Trong production, đặt job release sau job test/build, bảo vệ tag hoặc environment `production`, và dùng concurrency để tránh hai tiến trình phát hành cùng phiên bản. `contents: write` chỉ xuất hiện ở job release; job test không cần quyền đó.

## Khi GITHUB_TOKEN không đủ

### Ưu tiên GitHub App

Dùng GitHub App khi cần một hoặc nhiều khả năng sau:

- truy cập nhiều repository đã chọn;
- gọi API organization hoặc security API mà `GITHUB_TOKEN` không hỗ trợ;
- tạo sự kiện cần kích hoạt workflow tiếp theo mà không muốn cơ chế chống recursion của `GITHUB_TOKEN`;
- tách danh tính automation khỏi tài khoản cá nhân;
- installation token ngắn hạn với repository permission chi tiết.

Lưu App private key như secret được bảo vệ, chỉ tạo installation token trong job cần dùng và giới hạn danh sách repository. Nếu App chỉ cần hai repository, không cài nó cho toàn organization.

### PAT và OIDC dùng cho bài toán khác

**Fine-grained personal access token (PAT)** phù hợp khi API chưa hỗ trợ GitHub App hoặc cần hành động thực sự mang danh tính một người. PAT gắn với vòng đời tài khoản, SSO, membership và ngày hết hạn của chủ sở hữu. Vì vậy, nó dễ gây sự cố khi người đó đổi vai trò hoặc rời tổ chức. Ưu tiên fine-grained PAT có expiration và repository selection; dùng PAT classic như phương án cuối.

Không thay `GITHUB_TOKEN` bằng PAT chỉ để né việc thiết kế `permissions`. PAT có thể tồn tại lâu hơn và có blast radius lớn hơn.

**OpenID Connect (OIDC)** dùng để lấy credential ngắn hạn từ cloud hoặc hệ thống ngoài GitHub. Với OIDC, job cần `id-token: write`; phía provider phải kiểm tra `aud`, `sub`, repository, ref hoặc environment. OIDC không phải token thay thế để gọi GitHub REST API.

| Nhu cầu | Credential nên chọn |
|---|---|
| API trong chính repository của workflow | `GITHUB_TOKEN` với quyền job tối thiểu |
| API nhiều repository hoặc quyền GitHub chi tiết | GitHub App installation token |
| API cần danh tính người dùng và chưa có lựa chọn App phù hợp | Fine-grained PAT có hạn dùng |
| AWS, Azure, GCP, Vault hoặc cloud hỗ trợ federation | OIDC và credential ngắn hạn |

## Audit và kiểm thử quyền

### Review tĩnh workflow

Audit bắt đầu từ source, không bắt đầu từ log:

```bash
# Tìm nơi đã khai báo permissions.
git grep -nE '^[[:space:]]*permissions:' -- '.github/workflows/*.yml' '.github/workflows/*.yaml'

# Tìm các mẫu quá rộng.
git grep -nE 'permissions:[[:space:]]*(write-all|read-all)' -- '.github/workflows/*.yml' '.github/workflows/*.yaml'

# Tìm các trigger cần review đặc biệt.
git grep -nE 'pull_request_target|workflow_run' -- '.github/workflows/*.yml' '.github/workflows/*.yaml'
```

Với từng job, lập bảng: trigger → code được chạy → action/script → permission → secret → tài nguyên đích. Kiểm tra cả local action và script mà workflow gọi. Pin action/reusable workflow ngoài repository bằng full SHA và yêu cầu review qua `CODEOWNERS`.

Có thể dùng `actionlint` để bắt lỗi cú pháp và OpenSSF Scorecard hoặc CodeQL để tìm một số mẫu workflow nguy hiểm. Công cụ tự động hỗ trợ review; nó không chứng minh permission là tối thiểu theo nghiệp vụ.

### Xác nhận quyền hiệu lực của một run

Trong giao diện run, mở job rồi mở bước **Set up job**. GitHub ghi phần **GITHUB_TOKEN Permissions** với các quyền hiệu lực. Đây là nơi phát hiện fork downgrade hoặc job override khác với dự đoán.

Kiểm tra default cấu hình bằng GitHub CLI:

```bash
# Cần quyền quản trị phù hợp với repository.
gh api "repos/OWNER/REPOSITORY/actions/permissions/workflow"

# Organization owner có thể kiểm tra default của organization.
gh api "orgs/ORGANIZATION/actions/permissions/workflow"
```

Response thường cho biết `default_workflow_permissions` và việc workflow có được approve pull request hay không. Sau đó đối chiếu với YAML và event. Default settings không cho biết toàn bộ quyền cuối cùng của từng job.

Không in `${{ github.token }}` để audit. Giá trị bị mask trong log cũng không giúp xác định permission, và việc cố biến đổi token để xem là hành vi làm lộ credential.

### Kiểm thử permission failure

Một **negative test** cố ý gọi thao tác không được cấp quyền và kỳ vọng HTTP `403`. Ví dụ, với `permissions: {}`, tạo issue phải thất bại với thông báo thường gặp `Resource not accessible by integration`.

Một lỗi `403` chưa đủ chứng minh nguyên nhân. Endpoint có thể bị chặn bởi branch policy, organization policy, repository setting hoặc tính năng chưa bật. Vì vậy, hãy chạy cặp kiểm thử:

1. token không có scope phải thất bại;
2. một job riêng chỉ có đúng scope phải thành công;
3. cleanup mọi tài nguyên thử nghiệm;
4. kiểm tra phần **GITHUB_TOKEN Permissions** của cả hai job.

Không chạy negative test phá hủy như xóa package hoặc release. Hãy dùng tài nguyên phòng lab có thể đóng/xóa ngay.

## Bài thực hành

### Chuẩn bị

Dùng một repository thử nghiệm có GitHub Issues được bật. Không dùng production repository. Cần GitHub CLI đã đăng nhập trên máy để kích hoạt và xem run:

```bash
gh auth status
gh repo view --json nameWithOwner
```

Bài lab không cần tạo secret hay PAT.

### Workflow phòng lab

Tạo `.github/workflows/token-permissions-lab.yml` trong repository thử nghiệm:

```yaml
name: Token permissions lab

on:
  workflow_dispatch:

permissions: {}

jobs:
  denied-write:
    permissions: {}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Verify issue creation is denied
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          error_file="${RUNNER_TEMP}/denied-error.txt"
          response_file="${RUNNER_TEMP}/unexpected-issue.json"

          if gh api \
            --method POST \
            "repos/${GITHUB_REPOSITORY}/issues" \
            -f title='permission-lab-unexpected' \
            -f body="Unexpected success in run ${GITHUB_RUN_ID}" \
            > "$response_file" 2> "$error_file"; then
            issue_number="$(jq -r '.number' "$response_file")"
            gh issue close "$issue_number" \
              --repo "$GITHUB_REPOSITORY" \
              --comment "Cleanup after an unexpected permission result." || true
            echo "::error::Write unexpectedly succeeded with permissions: {}."
            exit 1
          fi

          echo "Write was denied as expected."
          grep -E '403|Resource not accessible|Forbidden' "$error_file" || true

  allowed-read:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Read the triggering commit
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          gh api \
            "repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}" \
            --jq '.sha'

  allowed-issue-write:
    needs: [denied-write, allowed-read]
    permissions:
      issues: write
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Create and close a lab issue
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          issue_url="$(
            gh issue create \
              --repo "$GITHUB_REPOSITORY" \
              --title "Permission lab run ${GITHUB_RUN_ID}" \
              --body "Temporary issue; this workflow closes it immediately."
          )"
          issue_number="${issue_url##*/}"
          gh issue close "$issue_number" \
            --repo "$GITHUB_REPOSITORY" \
            --comment "Cleanup completed by the permission lab."
```

Ba job nhận ba token khác nhau. Job cuối chỉ có `issues: write`; vì scope không nêu được đặt thành `none`, job đó không có `contents: read`.

### Chạy và tiêu chí hoàn thành

Commit workflow vào repository lab, rồi chạy:

```bash
gh workflow run token-permissions-lab.yml
gh run watch
gh run view --log
```

Hoàn thành bài khi:

- `denied-write` báo write bị từ chối nhưng job thành công vì đó là kết quả mong đợi;
- `allowed-read` đọc được SHA của commit;
- `allowed-issue-write` tạo rồi đóng issue tạm;
- **Set up job → GITHUB_TOKEN Permissions** của từng job khớp YAML;
- không có token, PAT hoặc secret thật trong workflow và log.

Sau đó đổi `allowed-read` thành `permissions: {}` và chạy lại. Job này phải thất bại khi đọc commit ở private repository. Với public repository, một số endpoint có thể đọc công khai; dùng private lab nếu muốn chứng minh rõ ranh giới `contents: read`.

## Best practices cho production

- Đặt `permissions: {}` ở đầu workflow nhiều job, rồi mở từng scope tại job.
- Tách build/test code không tin cậy khỏi release/deploy job có quyền ghi.
- Không dùng `write-all`; tránh `read-all` nếu có thể liệt kê scope.
- Xem action, local script và dependency install là code có thể dùng `github.token`.
- Pin third-party action và reusable workflow bằng full commit SHA đã xác minh.
- Với `actions/checkout`, đặt `persist-credentials: false` nếu các bước sau không cần Git credential.
- Dùng `pull_request` cho code PR. Không chạy PR head trong `pull_request_target` đặc quyền.
- Giữ private fork policy ở read-only/no-secrets trừ khi có threat model và approval rõ.
- Bảo vệ `.github/workflows/`, local actions và script phát hành bằng `CODEOWNERS` cùng branch protection.
- Dùng environment approval, protected tag/branch và concurrency cho release/deploy. `permissions` không thay thế các lớp này.
- Dùng GitHub App cho cross-repository; dùng OIDC cho cloud; tránh PAT classic dài hạn.
- Audit **GITHUB_TOKEN Permissions** trong run và chạy negative test khi thêm automation mới.
- Không ghi token vào log, output, artifact, cache hoặc process argument.
- Với self-hosted runner, dùng runner tạm thời, cô lập network và không chạy fork code trên runner có đường tới production.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý an toàn |
|---|---|---|
| `Resource not accessible by integration` | Thiếu scope, scope sai, fork downgrade hoặc policy cấp trên | Xem **Set up job → GITHUB_TOKEN Permissions**, tra permission của endpoint, rồi thêm đúng scope ở đúng job |
| `403 Forbidden` dù đã có `contents: write` | Branch/tag protection, ruleset, organization policy hoặc App không được phép bypass | Không tăng thành `write-all`; kiểm tra ruleset và thiết kế approval/bypass tường minh |
| `actions/checkout` báo không đọc được repository | `contents: read` bị thiếu hoặc token/repository context không đúng | Cấp `contents: read` cho job checkout; không dùng PAT rộng nếu chỉ checkout repository hiện tại |
| Job tạo release thất bại | Thiếu `contents: write`, tag không tồn tại hoặc release đã tồn tại | Kiểm tra trigger tag, `--verify-tag`, quyền hiệu lực và release hiện có |
| Workflow không kích hoạt sau khi workflow khác push bằng `GITHUB_TOKEN` | Cơ chế chống recursive run | Thiết kế `workflow_call`/`workflow_run` phù hợp; nếu thực sự cần event mới, dùng GitHub App quyền hẹp |
| `pull_request` từ fork không có write permission hoặc secret | GitHub cố ý giới hạn fork PR | Giữ CI không đặc quyền; chuyển publish/deploy sang post-merge hoặc environment approval |
| `pull_request_target` có quyền mạnh hơn dự kiến | Trigger chạy trong base context và có ngữ cảnh đặc quyền | Thêm `permissions: {}`, chỉ mở scope metadata cần thiết và tuyệt đối không chạy PR head |
| Called workflow yêu cầu quyền cao hơn caller | Chuỗi reusable workflow không được nâng quyền | Cấp contract tối thiểu ở calling job hoặc tách tác vụ đặc quyền; không dùng `write-all` |
| GITHUB_TOKEN không đọc được private repository khác | Token chỉ scoped cho repository caller | Dùng GitHub App cài trên đúng repositories; fine-grained PAT chỉ khi App không phù hợp |
| `id-token: write` nhưng cloud từ chối | Trust policy `aud`/`sub`, ref hoặc environment không khớp | Đối chiếu claims và policy phía cloud; không thêm quyền GitHub không liên quan |
| Job self-hosted dài hơn 24 giờ mất xác thực | Installation token không refresh vô hạn | Chia job ngắn hơn hoặc dùng cơ chế credential có lifecycle phù hợp và rotation rõ |
| API public vẫn đọc được khi `permissions: {}` | Endpoint cho phép anonymous public access hoặc không cần scope dự đoán | Kiểm thử trên private lab hoặc chọn endpoint write có cleanup; không kết luận token đã có quyền |

## Bài bảo mật liên quan

<Cards>
  <Card title="Quản lý secrets" href="/docs/bao-mat/02-secrets-management/" description="Giới hạn, rotate và cấp stored secrets đúng phạm vi." />
  <Card title="OIDC federation" href="/docs/bao-mat/03-oidc-federation/" description="Đổi identity của job lấy cloud credential ngắn hạn." />
  <Card title="Third-party actions" href="/docs/bao-mat/04-third-party-actions/" description="Review, pin SHA và giảm rủi ro dependency thực thi." />
  <Card title="Fork pull requests" href="/docs/bao-mat/06-fork-pull-requests/" description="Thiết kế CI an toàn cho contribution từ fork." />
</Cards>

## Tài liệu tham khảo

Các liên kết dưới đây là GitHub Docs chính thức, được đối chiếu với nội dung hiện hành năm 2026:

- [GITHUB_TOKEN concepts](https://docs.github.com/en/actions/concepts/security/github_token)
- [Use GITHUB_TOKEN for authentication in workflows](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)
- [Workflow syntax — permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
- [Managing GitHub Actions settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
- [Managing GitHub Actions settings for an organization](https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization)
- [Events that trigger workflows — pull_request](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)
- [Events that trigger workflows — pull_request_target](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)
- [Securely using pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [Reusing workflow configurations](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
- [Making API requests with a GitHub App in Actions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
- [OpenID Connect concepts](https://docs.github.com/en/actions/concepts/security/openid-connect)
- [REST API — GitHub Actions permissions](https://docs.github.com/en/rest/actions/permissions)
