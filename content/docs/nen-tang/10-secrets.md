---
title: "Secrets trong GitHub Actions"
description: "Quản lý, truyền và vận hành GitHub Actions secrets an toàn; phân biệt GITHUB_TOKEN và dùng OIDC thay cho cloud credential dài hạn."
---

<Callout type="warn" title="Secret không tự làm workflow an toàn">
  GitHub mã hóa secret khi lưu và cố gắng che giá trị trong log, nhưng code chạy trong job vẫn có thể đọc secret đã được cấp. Hãy coi workflow, action và runner là một phần của ranh giới tin cậy; chỉ cấp đúng secret, đúng quyền và đúng thời điểm.
</Callout>

## Mục lục

- [Mô hình bảo mật và vòng đời](#mô-hình-bảo-mật-và-vòng-đời)
  - [Secret được bảo vệ đến đâu](#secret-được-bảo-vệ-đến-đâu)
  - [Thời điểm GitHub đọc secret](#thời-điểm-github-đọc-secret)
- [Phạm vi, chính sách truy cập và độ ưu tiên](#phạm-vi-chính-sách-truy-cập-và-độ-ưu-tiên)
  - [Repository secrets](#repository-secrets)
  - [Environment secrets](#environment-secrets)
  - [Organization secrets](#organization-secrets)
  - [Quy tắc trùng tên](#quy-tắc-trùng-tên)
- [Tạo và quản lý bằng GitHub CLI](#tạo-và-quản-lý-bằng-github-cli)
  - [Tạo và cập nhật](#tạo-và-cập-nhật)
  - [Liệt kê và xóa](#liệt-kê-và-xóa)
- [Dùng secrets context an toàn](#dùng-secrets-context-an-toàn)
  - [Truyền qua biến môi trường](#truyền-qua-biến-môi-trường)
  - [Truyền qua input của action](#truyền-qua-input-của-action)
  - [Điều kiện if và chuỗi rỗng](#điều-kiện-if-và-chuỗi-rỗng)
- [Các ngữ cảnh không nhận secret](#các-ngữ-cảnh-không-nhận-secret)
  - [Pull request từ fork](#pull-request-từ-fork)
  - [Dependabot](#dependabot)
  - [Reusable workflows](#reusable-workflows)
- [Che log và giới hạn của masking](#che-log-và-giới-hạn-của-masking)
  - [Redaction không phải bảo đảm tuyệt đối](#redaction-không-phải-bảo-đảm-tuyệt-đối)
  - [add-mask cho giá trị phát sinh](#add-mask-cho-giá-trị-phát-sinh)
- [GITHUB_TOKEN không phải stored secret](#github_token-không-phải-stored-secret)
- [OIDC thay thông tin cloud dài hạn](#oidc-thay-thông-tin-cloud-dài-hạn)
  - [Luồng tin cậy](#luồng-tin-cậy)
  - [Mẫu workflow OIDC tối thiểu](#mẫu-workflow-oidc-tối-thiểu)
- [Threat model và giảm bề mặt tấn công](#threat-model-và-giảm-bề-mặt-tấn-công)
  - [Script injection](#script-injection)
  - [Third-party actions](#third-party-actions)
  - [Runner và mã không tin cậy](#runner-và-mã-không-tin-cậy)
- [Thực hành an toàn](#thực-hành-an-toàn)
  - [Chuẩn bị secret huấn luyện](#chuẩn-bị-secret-huấn-luyện)
  - [Workflow kiểm tra không in giá trị](#workflow-kiểm-tra-không-in-giá-trị)
  - [Chạy và kiểm chứng](#chạy-và-kiểm-chứng)
  - [Dọn dẹp](#dọn-dẹp)
- [Vận hành secret trong production](#vận-hành-secret-trong-production)
  - [Rotation, audit và thu hồi](#rotation-audit-và-thu-hồi)
  - [Best practices](#best-practices)
- [Ứng phó sự cố](#ứng-phó-sự-cố)
- [Troubleshooting](#troubleshooting)
- [Bài tiếp theo](#bài-tiếp-theo)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Mô hình bảo mật và vòng đời

GitHub Actions secret là một cặp tên–giá trị dành cho dữ liệu nhạy cảm, chẳng hạn token của package registry, khóa ký hoặc mật khẩu triển khai. Secret khác `vars`: biến cấu hình được thiết kế cho dữ liệu không nhạy cảm và không có cùng cơ chế bảo vệ.

Một vòng đời an toàn có bốn giai đoạn:

```text
Tạo với quyền tối thiểu
        ↓
Giới hạn repository hoặc environment được dùng
        ↓
Cấp cho đúng job/step, không ghi vào log
        ↓
Audit → rotate → thu hồi hoặc xóa
```

### Secret được bảo vệ đến đâu

GitHub dùng Libsodium sealed boxes để mã hóa secret ở phía client trước khi giá trị tới GitHub. Sau khi lưu, giao diện và API không cho đọc lại giá trị dạng rõ. Workflow chỉ nhận được secret khi file workflow tham chiếu rõ ràng đến nó.

Điều đó không ngăn code độc hại trong job lấy secret. Một người có quyền ghi repository có thể đề xuất hoặc tạo workflow gửi secret ra ngoài. Một action bị chiếm quyền cũng có thể đọc secret được truyền cho nó và dùng `GITHUB_TOKEN` trong phạm vi quyền của job.

<Callout type="error" title="Ranh giới tin cậy thực tế">
  Không cấp production secret cho job chạy code không tin cậy. Việc giá trị không đọc lại được trong Settings không ngăn workflow hợp lệ gửi nó đến một máy chủ bên ngoài.
</Callout>

Tên secret chỉ chứa chữ cái, chữ số hoặc dấu gạch dưới; không bắt đầu bằng số hay `GITHUB_`. Tên không phân biệt hoa thường và được GitHub lưu dạng chữ hoa. Giá trị tối đa 48 KB. GitHub cho phép tối đa 1.000 organization secrets, 100 repository secrets và 100 environment secrets.

### Thời điểm GitHub đọc secret

Thời điểm lấy giá trị phụ thuộc phạm vi:

- **Organization và repository secret** được đọc khi workflow run được đưa vào hàng đợi.
- **Environment secret** được đọc khi job tham chiếu environment bắt đầu. Nếu environment yêu cầu phê duyệt, job chưa nhận secret trước khi được duyệt.

Khác biệt này ảnh hưởng đến rotation. Một run đã xếp hàng có thể vẫn dùng giá trị repository cũ, trong khi environment secret được cập nhật trước lúc job bắt đầu có thể dùng giá trị mới. Sau rotation quan trọng, hãy hủy run cũ và tạo run mới thay vì giả định mọi run đang chờ đã dùng credential mới.

## Phạm vi, chính sách truy cập và độ ưu tiên

Chọn phạm vi hẹp nhất vẫn đáp ứng nhu cầu. Không nhân bản một credential quyền cao sang nhiều repository chỉ để cấu hình thuận tiện.

| Phạm vi | Dùng khi | Kiểm soát chính | Ai thường có quyền tạo |
|---|---|---|---|
| Repository | Chỉ một repository cần secret | Quyền ghi repository và workflow trong repository | Collaborator có quyền `write` |
| Environment | Secret gắn với `staging`, `production` hoặc một đích deploy | Required reviewers, nhánh/tag được phép deploy và protection rules | Owner của repository cá nhân hoặc quyền `admin` trong repository tổ chức |
| Organization | Nhiều repository dùng chung credential | Chính sách `all`, `private` hoặc danh sách repository được chọn | Organization owner |

### Repository secrets

Repository secret có sẵn cho workflow trong repository đó, trừ các ngữ cảnh bị GitHub hạn chế như pull request từ fork. Đây là lựa chọn phù hợp cho token đọc package của một ứng dụng duy nhất.

Đường dẫn giao diện là **Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret**. Người có quyền ghi workflow cần được xem là có khả năng sử dụng mọi repository secret, dù họ không thể mở Settings để xem giá trị dạng rõ.

### Environment secrets

Environment secret chỉ được đưa vào job khai báo đúng `environment`:

```yaml
jobs:
  deploy:
    environment: production
    runs-on: ubuntu-latest
    steps:
      - name: Gọi script triển khai tin cậy
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
        run: ./scripts/deploy.sh
```

Dùng environment cho production để kết hợp secret với required reviewers, giới hạn nhánh/tag và deployment protection rules. Approval là cổng cấp quyền: job không truy cập environment secret trước khi reviewer chấp thuận.

Không đặt mọi job vào `production`. Chỉ job deploy tối thiểu nên tham chiếu environment; các job build và test không cần nhận production secret.

### Organization secrets

Organization secret giảm trùng lặp khi nhiều repository dùng cùng một credential. Khi tạo secret, chọn một trong ba access policy:

- **All repositories:** mọi repository trong tổ chức được dùng; đây là phạm vi rộng nhất.
- **Private repositories:** chỉ repository private được dùng và là mặc định của `gh secret set --org`.
- **Selected repositories:** chỉ danh sách repository cụ thể được dùng; nên ưu tiên khi có thể.

GitHub Free không cung cấp organization-level secrets cho private repositories. Hãy kiểm tra gói dịch vụ và chính sách enterprise trước khi thiết kế chia sẻ secret.

Nếu repository được cấp hơn 100 organization secrets, workflow chỉ có thể dùng 100 secret đầu tiên sau khi sắp xếp tên theo thứ tự chữ cái. Đừng dựa vào cách đặt tiền tố để lách giới hạn; hãy giảm phạm vi và số credential dùng chung.

### Quy tắc trùng tên

Khi cùng một tên tồn tại ở nhiều cấp, cấp thấp hơn thắng:

```text
Environment secret  >  Repository secret  >  Organization secret
```

Ví dụ, `DEPLOY_TOKEN` ở environment `production` sẽ thay thế secret cùng tên ở repository cho job dùng environment đó. Quy tắc này hữu ích để ghi đè theo môi trường, nhưng cũng dễ làm rotation nhầm giá trị. Trong audit, luôn kiểm tra cả ba cấp và environment mà job thực sự tham chiếu.

## Tạo và quản lý bằng GitHub CLI

GitHub CLI tránh phải dán secret vào workflow. Đăng nhập và kiểm tra repository hiện tại trước:

```bash
gh auth login
gh auth status
gh repo view --json nameWithOwner
```

Không truyền secret bằng cờ dòng lệnh như `--body "gia-tri"`. Argument có thể xuất hiện trong process list, shell history hoặc audit của hệ điều hành. Hãy dùng prompt ẩn, `STDIN` hoặc file được bảo vệ.

### Tạo và cập nhật

Lệnh sau tạo hoặc thay thế repository secret. `gh` sẽ yêu cầu nhập giá trị mà không cần đặt nó trong command line:

```bash
gh secret set PACKAGE_READ_TOKEN
```

Tạo environment secret:

```bash
gh secret set --env production DEPLOY_TOKEN
```

Quản lý organization secret cần scope `admin:org`. Ví dụ này chỉ cấp cho hai repository:

```bash
gh auth refresh -h github.com -s admin:org
gh secret set --org octo-org SHARED_PACKAGE_TOKEN --repos web-api,worker
```

Nếu tổ chức thực sự cần chia sẻ cho mọi repository, khai báo rõ chính sách:

```bash
gh secret set --org octo-org SHARED_PACKAGE_TOKEN --visibility all
```

Đọc từ file chỉ phù hợp khi file đã được bảo vệ và sẽ được xóa an toàn sau đó:

```bash
gh secret set SIGNING_PRIVATE_KEY < signing-key.pem
```

Ưu tiên secret store của hệ điều hành hoặc secret manager làm nguồn. Không commit file rõ vào Git, kể cả khi dự định xóa ở commit sau.

### Liệt kê và xóa

Các lệnh `list` chỉ hiển thị tên và metadata, không hiển thị giá trị:

```bash
gh secret list
gh secret list --env production
gh secret list --org octo-org
```

Xóa secret khi không còn dùng:

```bash
gh secret delete PACKAGE_READ_TOKEN
gh secret delete --env production DEPLOY_TOKEN
gh secret delete --org octo-org SHARED_PACKAGE_TOKEN
```

Xóa trên GitHub không tự thu hồi credential ở nhà cung cấp. Với token đã cấp, hãy revoke ở hệ thống phát hành token trước hoặc ngay sau khi xóa bản lưu trên GitHub.

## Dùng secrets context an toàn

Truy cập stored secret bằng `${{ secrets.TEN_SECRET }}`. Chỉ ánh xạ secret ở phạm vi hẹp nhất. Không dump toàn bộ `secrets` context, không đưa secret vào artifact, cache, job summary hoặc output giữa các job.

### Truyền qua biến môi trường

Với lệnh shell, ánh xạ secret vào `env`, rồi dùng biến shell có dấu nháy:

```yaml
- name: Đăng nhập registry qua STDIN
  shell: bash
  env:
    REGISTRY_USER: ${{ vars.REGISTRY_USER }}
    REGISTRY_PASSWORD: ${{ secrets.REGISTRY_PASSWORD }}
  run: |
    set -euo pipefail
    printf '%s' "$REGISTRY_PASSWORD" |
      docker login ghcr.io --username "$REGISTRY_USER" --password-stdin
```

Cách này tốt hơn chèn expression trực tiếp vào script như `run: command '${{ secrets.REGISTRY_PASSWORD }}'`. Expression được GitHub thay thế trước khi shell chạy; ký tự đặc biệt có thể phá cú pháp. Đưa secret vào argument cũng có thể làm nó lộ qua process list. Nếu công cụ hỗ trợ, ưu tiên `STDIN`, file descriptor hoặc cơ chế credential riêng của công cụ.

Giữ `env` ở cấp step nếu chỉ một step cần secret. Job-level `env` khiến mọi step và action trong job có thể tiếp cận giá trị đó.

### Truyền qua input của action

Một action chỉ nhận stored secret khi workflow ánh xạ nó vào input hoặc environment variable. Ví dụ với local action đã được review:

```yaml
- name: Publish bằng action nội bộ
  uses: ./.github/actions/publish
  with:
    registry-token: ${{ secrets.REGISTRY_TOKEN }}
```

`with` không tự an toàn hơn `env`. Action có thể đọc input và gửi giá trị ra ngoài. Đọc `action.yml`, source code và tài liệu của action để xác nhận đúng tên input và cách action xử lý log. Chỉ truyền từng secret cần thiết; không gom nhiều credential vào một JSON secret.

### Điều kiện if và chuỗi rỗng

Không thể tham chiếu `secrets.*` trực tiếp trong khóa `if`. Mẫu đúng là đưa secret vào job-level environment variable, rồi kiểm tra `env` ở step:

```yaml
jobs:
  optional-publish:
    runs-on: ubuntu-latest
    env:
      REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}
    steps:
      - name: Publish khi token khả dụng
        if: ${{ env.REGISTRY_TOKEN != '' }}
        env:
          TOKEN_FOR_TOOL: ${{ env.REGISTRY_TOKEN }}
        run: ./scripts/publish.sh

      - name: Báo bỏ qua an toàn
        if: ${{ env.REGISTRY_TOKEN == '' }}
        run: echo "Không publish vì credential không khả dụng."
```

Job-level `env` mở rộng phạm vi secret cho tất cả step trong job. Vì vậy, giữ job này ngắn, không chạy action không cần thiết và tách kiểm tra không đặc quyền sang job khác.

Nếu secret chưa được cấu hình hoặc không khả dụng trong run, expression như `${{ secrets.REGISTRY_TOKEN }}` trả về **chuỗi rỗng**. Đừng để công cụ âm thầm chuyển sang anonymous access hoặc deploy sai đích. Với thao tác bắt buộc, hãy kiểm tra rỗng và fail closed:

```yaml
- name: Yêu cầu credential triển khai
  shell: bash
  env:
    DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
  run: |
    set -euo pipefail
    if [[ -z "${DEPLOY_TOKEN:-}" ]]; then
      echo "::error::DEPLOY_TOKEN không khả dụng cho run này."
      exit 1
    fi
    ./scripts/deploy.sh
```

## Các ngữ cảnh không nhận secret

GitHub cố ý không cấp stored secret cho một số nguồn sự kiện không tin cậy. Đây là lớp bảo vệ, không phải lỗi cần “sửa” bằng cách đổi trigger đặc quyền hơn.

### Pull request từ fork

Ngoại trừ `GITHUB_TOKEN`, stored secrets không được gửi tới runner khi workflow được kích hoạt từ fork. `GITHUB_TOKEN` của pull request từ fork thường chỉ có quyền đọc.

Thiết kế an toàn là:

1. chạy build, lint và test không cần secret trên `pull_request`;
2. chỉ chạy tác vụ đặc quyền sau khi merge, sau phê duyệt environment hoặc trong một workflow tách biệt;
3. không dùng `pull_request_target` như đường tắt để lấy secret rồi checkout và chạy code từ PR fork.

`pull_request_target` chạy trong ngữ cảnh nhánh đích và có thể có secret/quyền ghi. Nếu workflow đó checkout PR head hoặc thực thi script từ PR, kẻ tấn công có thể chiếm repository và credential.

### Dependabot

Run do Dependabot kích hoạt từ `push`, `pull_request`, `pull_request_review` hoặc `pull_request_review_comment` được xử lý tương tự fork: `GITHUB_TOKEN` chỉ đọc và GitHub Actions secrets không khả dụng. Chỉ **Dependabot secrets** được đưa vào `secrets` context.

Nếu cùng một workflow phải chạy cho người dùng và Dependabot, có thể tạo Actions secret và Dependabot secret cùng tên với quyền chỉ đọc tối thiểu. Không tăng quyền ghi chỉ để một dependency update vượt qua CI. Một lựa chọn đơn giản hơn là bỏ qua step cần credential khi `github.actor == 'dependabot[bot]'` và giữ các kiểm tra còn lại.

### Reusable workflows

Secrets không tự truyền vào reusable workflow. Caller phải truyền từng tên:

```yaml
jobs:
  call-publish:
    uses: ./.github/workflows/publish.yml
    secrets:
      registry-token: ${{ secrets.REGISTRY_TOKEN }}
```

Called workflow phải khai báo contract:

```yaml
on:
  workflow_call:
    secrets:
      registry-token:
        required: true
```

`secrets: inherit` truyền rộng hơn và chỉ dùng được cho workflow trong cùng organization hoặc enterprise. Ưu tiên danh sách tường minh để reviewer thấy credential nào đi qua ranh giới tái sử dụng.

Trong chuỗi A gọi B gọi C, secret chỉ đi đến workflow được gọi trực tiếp. B phải truyền tiếp nếu C cần. Environment secrets không thể được truyền qua `on.workflow_call`; nếu called workflow gắn `environment` ở cấp job, environment secret của called workflow được dùng và có thể ghi đè secret caller truyền cùng tên.

## Che log và giới hạn của masking

GitHub tự động redact giá trị của GitHub secrets và một số định dạng nhạy cảm đã nhận diện, thường thay bằng `***`. Masking giúp giảm tai nạn trong log; nó không phải cơ chế kiểm soát truy cập và không chứng minh rằng secret chưa bị lấy đi.

### Redaction không phải bảo đảm tuyệt đối

Redaction chủ yếu dựa trên so khớp giá trị mà runner biết trong job hiện tại. Nó có thể thất bại khi:

- secret bị Base64, URL-encode, cắt nhỏ, nối chuỗi hoặc biến đổi trước khi in;
- một JSON, XML hoặc YAML lớn chứa nhiều trường nhạy cảm nhưng được lưu như một secret duy nhất;
- giá trị phát sinh chỉ tồn tại ở job khác và chưa được đăng ký để mask;
- tool ghi dữ liệu vào artifact, file, network hoặc service bên ngoài thay vì workflow log;
- secret xuất hiện trước khi lệnh mask được đăng ký.

Base64 chỉ là encoding, không phải encryption. Đừng in secret để “kiểm tra masking”. Hãy thiết kế workflow không tạo log nhạy cảm ngay từ đầu, tắt shell tracing như `set -x`, và kiểm tra cả `STDOUT` lẫn `STDERR` của công cụ.

<Callout type="warn" title="Không lấy dấu *** làm bằng chứng an toàn">
  `***` chỉ cho biết runner đã che một chuỗi trong vị trí log đó. Nó không cho biết action có gửi secret qua mạng hay ghi vào artifact hay không.
</Callout>

### add-mask cho giá trị phát sinh

Dùng workflow command `::add-mask::VALUE` cho dữ liệu nhạy cảm không được lưu dưới dạng GitHub secret, chẳng hạn access token ngắn hạn được tạo trong job. Phải mask ngay sau khi sinh và trước mọi lệnh có thể ghi giá trị:

```yaml
- name: Tạo và dùng access token ngắn hạn
  shell: bash
  env:
    CLIENT_SECRET: ${{ secrets.CLIENT_SECRET }}
  run: |
    set -euo pipefail
    set +x
    access_token="$(
      printf '%s' "$CLIENT_SECRET" |
        ./scripts/create-short-lived-token --secret-stdin
    )"
    echo "::add-mask::$access_token"
    printf '%s' "$access_token" | ./scripts/deploy --token-stdin
    unset access_token
```

Mask mỗi dạng biến đổi nhạy cảm riêng, ví dụ giá trị gốc và dạng URL-encoded. `add-mask` có hiệu lực theo job và không biến một thiết kế truyền secret qua output giữa các job thành an toàn. Giữ token phát sinh và nơi sử dụng trong cùng job nếu có thể.

## GITHUB_TOKEN không phải stored secret

`GITHUB_TOKEN` là installation access token GitHub tự tạo cho mỗi job. Bạn không tạo nó trong **Secrets and variables**, không rotate thủ công và có thể tham chiếu bằng `${{ secrets.GITHUB_TOKEN }}` hoặc `github.token`. Token hết hiệu lực khi job kết thúc hoặc chậm nhất theo giới hạn vòng đời của token.

Điểm quan trọng là action trong job có thể truy cập `github.token` dù workflow không truyền token tường minh. Vì vậy, luôn thu hẹp quyền:

```yaml
permissions:
  contents: read

jobs:
  report:
    permissions:
      contents: read
      issues: write
    runs-on: ubuntu-latest
    steps:
      - name: Tạo issue bằng gh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh issue create --title "Báo cáo tự động" --body "Run $GITHUB_RUN_ID"
```

Khi khai báo một số quyền, các quyền không nêu được đặt thành `none`. Chỉ cấp quyền ghi ở job thực sự cần. Nếu `GITHUB_TOKEN` không hỗ trợ quyền hoặc repository ngoài phạm vi cần thiết, ưu tiên GitHub App với token ngắn hạn và quyền chi tiết. Chỉ dùng fine-grained PAT như phương án sau; tránh PAT classic gắn với tài khoản cá nhân.

## OIDC thay thông tin cloud dài hạn

OpenID Connect cho phép job chứng minh danh tính với cloud provider rồi đổi lấy access token ngắn hạn. Nhờ đó, workflow không phải lưu `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, Azure client secret hoặc service-account key dài hạn.

### Luồng tin cậy

```text
GitHub job
   │ yêu cầu OIDC JWT với id-token: write
   ▼
GitHub OIDC provider
   │ JWT có aud, sub, repository, ref, environment...
   ▼
Cloud identity provider kiểm tra trust policy
   │ chỉ chấp nhận repository/ref/environment đã cho phép
   ▼
Cloud cấp access token ngắn hạn với role tối thiểu
```

Cấu hình phải có điều kiện trust. Tối thiểu, cloud provider cần kiểm tra `aud` và `sub` hoặc claims tương đương để không cho repository không tin cậy nhận role. Nên ràng buộc vào repository cụ thể, nhánh được bảo vệ hoặc environment có approval; tránh wildcard toàn tổ chức.

`permissions: id-token: write` chỉ cho phép job yêu cầu OIDC token. Nó không tự cấp quyền sửa tài nguyên cloud. Quyền cloud đến từ role và policy phía provider, vì vậy cả trust policy lẫn role permission đều phải tuân theo least privilege.

<Callout type="info" title="Thay đổi claim trong năm 2026">
  Theo GitHub Docs, repository tạo sau ngày 15/07/2026 hoặc đã opt in có thể dùng immutable `sub` chứa owner ID và repository ID. Khi OIDC bị từ chối sau khi tạo, đổi tên hoặc chuyển repository, hãy đối chiếu claim thực tế và cập nhật trust policy; không nới thành wildcard để xử lý nhanh.
</Callout>

### Mẫu workflow OIDC tối thiểu

Ví dụ AWS sau không dùng access key dài hạn. `AWS_ROLE_ARN` và `AWS_REGION` là cấu hình không nhạy cảm nên lưu bằng GitHub Actions variables. SHA của action khớp ví dụ trong GitHub Docs OIDC cho AWS tại thời điểm tài liệu này được rà soát năm 2026.

```yaml
name: Verify AWS identity with OIDC

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify-identity:
    environment: staging
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Đổi OIDC token lấy AWS credential ngắn hạn
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502
        with:
          role-to-assume: ${{ vars.AWS_ROLE_ARN }}
          role-session-name: github-actions-oidc-check
          aws-region: ${{ vars.AWS_REGION }}

      - name: Xác nhận role, không in token
        shell: bash
        run: aws sts get-caller-identity --query Arn --output text
```

Phía AWS phải trust issuer `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com` và `sub` đúng với repository/environment `staging`. Các cloud khác dùng action đăng nhập chính thức và nguyên tắc tương tự: token ngắn hạn, trust condition hẹp và role tối thiểu.

## Threat model và giảm bề mặt tấn công

Trước khi cấp secret, trả lời bốn câu hỏi:

1. Ai có thể sửa workflow, local action hoặc script mà workflow gọi?
2. Event nào kích hoạt job, và dữ liệu nào do người không tin cậy kiểm soát?
3. Action, container và runner nào có thể đọc environment, workspace hoặc token?
4. Nếu credential bị lấy, nó truy cập được tài nguyên nào và tồn tại bao lâu?

### Script injection

Dữ liệu như tiêu đề PR, branch name, issue body và input thủ công có thể do attacker kiểm soát. Không chèn context đó trực tiếp vào `run`:

Ví dụ không an toàn dưới đây biến dữ liệu PR thành một phần của script Bash:

```yaml
- run: echo "${{ github.event.pull_request.title }}" | ./scripts/check-title.sh
```

Đưa dữ liệu vào biến môi trường trung gian và quote biến shell:

```yaml
- name: Kiểm tra tiêu đề PR
  shell: bash
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: printf '%s\n' "$PR_TITLE" | ./scripts/check-title.sh
```

Tốt hơn nữa, dùng action nhận dữ liệu qua `with` nếu action đó xử lý input như dữ liệu thay vì ghép vào shell. Secret masking không chặn script injection; attacker có thể dùng lệnh để gửi environment ra mạng.

### Third-party actions

Action chạy trong job là dependency có quyền thực thi. Để giảm rủi ro:

- pin action ngoài repository vào full-length commit SHA và xác minh SHA thuộc repository gốc;
- review source, `action.yml`, release notes và domain mạng action truy cập;
- ưu tiên publisher đã xác minh, nhưng không xem badge hay tag là bất biến;
- truyền đúng một secret cần thiết thay vì đặt ở job-level `env`;
- đặt `permissions` tối thiểu và tách job đặc quyền khỏi job build;
- dùng `CODEOWNERS` cho `.github/workflows/` và local actions;
- bật Dependabot cho GitHub Actions để có PR cập nhật SHA đã review.

Pin SHA ngăn tag bị di chuyển sau khi review. Nó không bảo đảm code ở SHA đó an toàn, nên vẫn phải review nguồn.

### Runner và mã không tin cậy

GitHub-hosted runner dùng máy ảo tạm thời, nhưng mọi step trong cùng job chia sẻ môi trường đủ để tác động lẫn nhau. Self-hosted runner có thể giữ trạng thái và bị chiếm quyền lâu dài; gần như không nên dùng self-hosted runner cho public repository.

Không chạy test từ fork trên runner có production network access. Không để credential cloud tĩnh trên máy runner. Với self-hosted runner, tách runner group theo mức tin cậy, dùng máy ephemeral nếu có thể và giới hạn egress đến đúng dịch vụ cần thiết.

## Thực hành an toàn

Bài thực hành tạo một secret dùng một lần, xác nhận workflow nhận được nó và kiểm tra log không chứa giá trị. Không dùng API key, mật khẩu hay token thật.

### Chuẩn bị secret huấn luyện

Từ thư mục repository thử nghiệm, tạo 32 byte ngẫu nhiên và truyền thẳng qua `STDIN` cho GitHub CLI:

```bash
openssl rand -hex 32 | gh secret set ACTIONS_DEMO_TOKEN
```

Giá trị không được in ra terminal và không đi vào shell history. Xác nhận chỉ có tên secret:

```bash
gh secret list
```

### Workflow kiểm tra không in giá trị

Tạo `.github/workflows/validate-secret.yml` với nội dung:

```yaml
name: Validate secret safely

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Kiểm tra secret có mặt mà không in giá trị
        shell: bash
        env:
          ACTIONS_DEMO_TOKEN: ${{ secrets.ACTIONS_DEMO_TOKEN }}
        run: |
          set -euo pipefail
          set +x

          if [[ -z "${ACTIONS_DEMO_TOKEN:-}" ]]; then
            echo "::error::ACTIONS_DEMO_TOKEN không khả dụng."
            exit 1
          fi

          if (( ${#ACTIONS_DEMO_TOKEN} < 32 )); then
            echo "::error::Secret huấn luyện không đạt độ dài tối thiểu."
            exit 1
          fi

          echo "Secret khả dụng; workflow không ghi giá trị ra log."
```

Workflow không checkout code, không gọi action bên thứ ba và chỉ cấp secret cho một step. `set +x` bảo đảm shell tracing bị tắt. Kiểm tra chỉ dùng trạng thái và độ dài trong bộ nhớ, không in giá trị hay hash của giá trị.

### Chạy và kiểm chứng

Commit workflow, push lên nhánh mặc định rồi chạy:

```bash
gh workflow run validate-secret.yml
gh run watch
```

Sau khi run thành công, đọc log:

```bash
gh run view --log
```

Tiêu chí hoàn thành:

- run có kết luận `success`;
- log có câu `Secret khả dụng; workflow không ghi giá trị ra log.`;
- log không có lệnh `echo` hoặc `printf` nào nhận `ACTIONS_DEMO_TOKEN` làm dữ liệu xuất;
- workflow không tạo artifact, output, summary hay file chứa secret;
- repository chỉ chứa file workflow, không chứa giá trị đã tạo.

Không tìm kiếm log bằng cách dán secret vào command line. Thao tác đó tự tạo thêm bản sao trong shell history. Hãy review code path và raw log để xác nhận chỉ thông báo không nhạy cảm được xuất.

### Dọn dẹp

Xóa secret huấn luyện ngay sau bài:

```bash
gh secret delete ACTIONS_DEMO_TOKEN
```

Chạy workflow lần nữa. Kết quả mong đợi là failure với thông báo secret không khả dụng, nhưng không có giá trị nhạy cảm nào trong log. Thử nghiệm âm này xác nhận workflow fail closed khi expression trả chuỗi rỗng.

## Vận hành secret trong production

Stored secret cần owner, mục đích, phạm vi, ngày rotate và quy trình revoke. Nếu không biết credential thuộc hệ thống nào hoặc ai chịu trách nhiệm, bạn chưa thể ứng phó nhanh khi nó lộ.

### Rotation, audit và thu hồi

Quy trình rotation không downtime nên theo thứ tự:

1. tạo credential mới ở nhà cung cấp với quyền tối thiểu;
2. nếu nhà cung cấp hỗ trợ hai credential đồng thời, giữ credential cũ trong thời gian chuyển tiếp ngắn;
3. cập nhật đúng organization, repository hoặc environment secret bằng `gh secret set`;
4. tạo run mới và kiểm tra đường đi thành công mà không in giá trị;
5. thu hồi credential cũ tại nhà cung cấp;
6. hủy run cũ còn xếp hàng, ghi lại thời điểm và người thực hiện.

Audit định kỳ cần kiểm tra:

- secret còn được workflow nào tham chiếu;
- organization access policy có repository dư thừa không;
- environment có reviewer và branch/tag restriction phù hợp không;
- action hoặc script nào nhận từng secret và gọi ra domain nào;
- log của cả input hợp lệ lẫn không hợp lệ có vô tình ghi `STDERR` nhạy cảm không;
- GitHub organization audit log và log của nhà cung cấp có hành vi bất thường không.

Xóa secret không còn dùng và revoke credential nguồn. Rotation chỉ thay giá trị trên GitHub mà không revoke giá trị cũ vẫn để lại credential hợp lệ cho attacker.

### Best practices

- **Ưu tiên credential ngắn hạn:** dùng OIDC cho cloud, GitHub App cho GitHub API và token theo phiên nếu dịch vụ hỗ trợ.
- **Least privilege ở hai lớp:** thu hẹp scope của credential ngoài GitHub và `permissions` của `GITHUB_TOKEN`.
- **Phạm vi hẹp nhất:** step trước job, environment/repository trước organization, selected repositories trước `all`.
- **Tách job theo mức tin cậy:** build code không tin cậy không nằm cùng job với deploy secret.
- **Fail closed:** secret rỗng phải dừng tác vụ nhạy cảm, không fallback sang anonymous hoặc credential khác.
- **Không lưu dữ liệu có cấu trúc trong một secret:** tách JSON/XML/YAML thành các secret nguyên tử để masking và rotation dễ kiểm soát.
- **Không ghi ra nơi bền vững:** tránh artifact, cache, `$GITHUB_STEP_SUMMARY`, output, debug bundle và file trong workspace.
- **Không dùng secret trong command line:** ưu tiên `STDIN`, environment variable có quote hoặc credential file tạm với quyền hạn chế và xóa ngay.
- **Review dependency thực thi:** pin full SHA, review source và bảo vệ thay đổi workflow bằng branch protection cùng `CODEOWNERS`.
- **Đặt lịch rotation và diễn tập revoke:** credential quyền cao hoặc signing key cần chu kỳ ngắn hơn và runbook đã thử nghiệm.

## Ứng phó sự cố

Nếu nghi secret đã xuất hiện trong log, artifact, commit hoặc network request, giả định secret đã bị lộ. Masking sau đó không làm giá trị hết hiệu lực.

1. **Contain:** hủy run đang chạy, tạm vô hiệu workflow đáng ngờ và cô lập self-hosted runner liên quan.
2. **Revoke trước:** thu hồi credential tại cloud, registry hoặc hệ thống phát hành. Nếu không revoke được ngay, vô hiệu account/role hoặc chặn network path.
3. **Thay giá trị:** tạo credential mới với quyền hẹp hơn, cập nhật secret và hủy các run cũ đang chờ.
4. **Xóa bản sao:** xóa workflow log, artifact hoặc release asset có dữ liệu. Nếu secret từng commit, xóa khỏi lịch sử Git và phối hợp với GitHub Support khi cần; chỉ commit xóa ở đầu nhánh là chưa đủ.
5. **Điều tra:** xem organization audit log, run ID, actor, commit, action SHA, cloud audit log và lưu lượng ra ngoài để xác định phạm vi.
6. **Mở rộng rotation:** thay các credential liên quan, token được sinh từ secret và khóa có cùng trust chain.
7. **Khắc phục rồi mới bật lại:** sửa workflow, pin dependency, giảm quyền, thêm review và chạy kiểm chứng bằng credential dùng một lần.

<Callout type="error" title="Ưu tiên thu hồi hơn xóa log">
  Xóa log giảm khả năng người khác nhìn thấy secret, nhưng attacker có thể đã sao chép nó. Revoke hoặc vô hiệu credential tại hệ thống nguồn mới chặn việc sử dụng tiếp.
</Callout>

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý an toàn |
|---|---|---|
| `${{ secrets.NAME }}` thành chuỗi rỗng | Sai tên; chưa tạo secret; organization policy không cấp repository; job chưa tham chiếu environment | Chạy `gh secret list` ở đúng phạm vi, kiểm tra access policy và `jobs.<job_id>.environment`; fail closed thay vì tiếp tục |
| Có secret ở Settings nhưng fork PR không nhận được | GitHub cố ý chặn stored secrets cho fork | Giữ CI không đặc quyền trên `pull_request`; chuyển tác vụ cần secret sang post-merge hoặc environment có approval |
| Dependabot run thiếu token | Actions secrets không cấp cho event do Dependabot; token mặc định chỉ đọc | Dùng Dependabot secret cùng tên với quyền chỉ đọc hoặc bỏ qua riêng step cần credential |
| Reusable workflow báo thiếu secret | Caller không tự động truyền secret hoặc secret chỉ được truyền một cấp | Khai báo `on.workflow_call.secrets`, truyền tên rõ trong `jobs.<id>.secrets`, và truyền tiếp ở từng tầng |
| Environment dùng giá trị khác dự kiến | Secret cùng tên ở environment ghi đè repository và organization | Kiểm tra độ ưu tiên `environment > repository > organization` và environment thực tế của job |
| Không thể dùng `secrets.*` trong `if` | `secrets` context không khả dụng trực tiếp tại khóa `if` của step/job | Ánh xạ vào job-level `env`, kiểm tra `env.NAME != ''`, rồi giữ job ngắn và tin cậy |
| Log hiện `***` | Runner đã nhận diện và redact chuỗi | Đây là hành vi mong đợi; vẫn xóa mọi lệnh in secret và audit artifact/network thay vì dựa vào masking |
| Giá trị biến đổi xuất hiện trong log | Mask chỉ biết giá trị gốc hoặc đăng ký quá muộn | Không in giá trị; gọi `::add-mask::` cho từng giá trị phát sinh trước khi tool có thể ghi log; rotate nếu đã lộ |
| Organization secret không khả dụng dù policy đúng | Repository được cấp hơn 100 organization secrets và secret không nằm trong 100 tên đầu theo alphabet, hoặc giới hạn gói GitHub | Giảm số secret dùng chung, chia phạm vi hợp lý và kiểm tra gói dịch vụ |
| OIDC báo không được assume role | Thiếu `id-token: write`; `aud`/`sub` không khớp; environment hoặc immutable subject làm claim đổi | Xem claim và trust policy, ràng buộc đúng repository/ref/environment; không mở wildcard để né lỗi |
| Secret mới không có hiệu lực trong run cũ | Repository/organization secret được đọc lúc run xếp hàng | Hủy run cũ và tạo run mới; với sự cố, revoke credential cũ ở provider |

## Bài tiếp theo

<Cards>
  <Card title="Contexts" href="/docs/nen-tang/07-contexts/" description="Hiểu secrets, env, vars, github và phạm vi context trong workflow." />
  <Card title="Variables và environment variables" href="/docs/nen-tang/09-variables-va-environment-variables/" description="Tách cấu hình không nhạy cảm khỏi secrets và kiểm soát phạm vi biến." />
  <Card title="GITHUB_TOKEN và permissions" href="/docs/bao-mat/01-github-token-permissions/" description="Áp dụng least privilege cho token tự động của từng job." />
  <Card title="OIDC federation" href="/docs/bao-mat/03-oidc-federation/" description="Thiết lập trust policy và credential cloud ngắn hạn." />
</Cards>

## Tài liệu tham khảo

Tất cả liên kết dưới đây là GitHub Docs chính thức, được đối chiếu với nội dung hiện hành năm 2026:

- [About secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/about-secrets)
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [Secrets reference](https://docs.github.com/en/actions/reference/security/secrets)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [Use GITHUB_TOKEN for authentication in workflows](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)
- [Workflow commands — masking a value in a log](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#masking-a-value-in-a-log)
- [Reuse workflows — passing inputs and secrets](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#passing-inputs-and-secrets-to-a-reusable-workflow)
- [Dependabot on GitHub Actions — accessing secrets](https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-on-actions#accessing-secrets)
- [OpenID Connect concepts](https://docs.github.com/en/actions/concepts/security/openid-connect)
- [Configuring OpenID Connect in cloud providers](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers)
- [OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc)
- [Configuring OpenID Connect in AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
