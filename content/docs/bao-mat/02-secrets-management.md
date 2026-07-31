---
title: "Quản lý secrets trong production"
description: "Thiết kế phạm vi, cấp phát, xoay vòng, phát hiện rò rỉ và audit secrets trong GitHub Actions theo mô hình quyền tối thiểu."
---

<Callout type="warn" title="Masking không phải ranh giới bảo mật">
  GitHub mã hóa secret khi lưu và tự động che nhiều giá trị trong log. Tuy nhiên, code đã chạy trong một job có secret vẫn có thể gửi giá trị đó ra ngoài qua mạng, artifact hoặc hệ thống đích. Hãy coi workflow, action, runner và mọi script được gọi là code đặc quyền cần được review.
</Callout>

## Mục lục

- [Mô hình đe dọa và mục tiêu](#mô-hình-đe-dọa-và-mục-tiêu)
  - [Tài sản và chủ thể cần xem xét](#tài-sản-và-chủ-thể-cần-xem-xét)
  - [Ranh giới tin cậy](#ranh-giới-tin-cậy)
  - [Kịch bản tấn công chính](#kịch-bản-tấn-công-chính)
- [Phạm vi và độ ưu tiên của secrets](#phạm-vi-và-độ-ưu-tiên-của-secrets)
  - [Repository secrets](#repository-secrets)
  - [Environment secrets](#environment-secrets)
  - [Organization secrets](#organization-secrets)
  - [Trùng tên thời điểm đọc và giới hạn](#trùng-tên-thời-điểm-đọc-và-giới-hạn)
- [Bảo vệ environment và approval](#bảo-vệ-environment-và-approval)
  - [Approval là cổng cấp secret](#approval-là-cổng-cấp-secret)
  - [Thiết kế environment production](#thiết-kế-environment-production)
- [Dùng secrets context an toàn](#dùng-secrets-context-an-toàn)
  - [Chỉ cấp cho step cần thiết](#chỉ-cấp-cho-step-cần-thiết)
  - [Điều kiện và secret bị thiếu](#điều-kiện-và-secret-bị-thiếu)
  - [Pull request từ fork](#pull-request-từ-fork)
  - [Dependabot](#dependabot)
  - [Reusable workflows](#reusable-workflows)
- [Masking và ngăn rò rỉ](#masking-và-ngăn-rò-rỉ)
  - [Masking làm được và không làm được gì](#masking-làm-được-và-không-làm-được-gì)
  - [Chặn log leak và exfiltration](#chặn-log-leak-và-exfiltration)
  - [Mask giá trị phát sinh](#mask-giá-trị-phát-sinh)
- [Quản lý bằng GitHub CLI](#quản-lý-bằng-github-cli)
  - [Tạo cập nhật liệt kê và xóa](#tạo-cập-nhật-liệt-kê-và-xóa)
  - [Quy ước tên và dữ liệu lớn](#quy-ước-tên-và-dữ-liệu-lớn)
- [Chọn đúng cơ chế xác thực](#chọn-đúng-cơ-chế-xác-thực)
  - [Variables và GITHUB_TOKEN](#variables-và-github_token)
  - [OIDC](#oidc)
  - [GitHub App](#github-app)
  - [External secret manager](#external-secret-manager)
- [Workflow production an toàn](#workflow-production-an-toàn)
  - [Các quyết định thiết kế](#các-quyết-định-thiết-kế)
  - [Workflow hoàn chỉnh](#workflow-hoàn-chỉnh)
  - [Cách kiểm chứng](#cách-kiểm-chứng)
- [Rotation thu hồi và ứng phó sự cố](#rotation-thu-hồi-và-ứng-phó-sự-cố)
  - [Rotation có kế hoạch](#rotation-có-kế-hoạch)
  - [Xử lý secret nghi bị lộ](#xử-lý-secret-nghi-bị-lộ)
- [Secret scanning và push protection](#secret-scanning-và-push-protection)
  - [Secret scanning](#secret-scanning)
  - [Push protection](#push-protection)
  - [Xử lý alert](#xử-lý-alert)
- [Audit và governance](#audit-và-governance)
  - [Inventory và access review](#inventory-và-access-review)
  - [Bằng chứng và giám sát](#bằng-chứng-và-giám-sát)
- [Bài thực hành](#bài-thực-hành)
  - [Chuẩn bị](#chuẩn-bị)
  - [Workflow cho bài thực hành](#workflow-cho-bài-thực-hành)
  - [Các bước và tiêu chí đạt](#các-bước-và-tiêu-chí-đạt)
  - [Dọn dẹp](#dọn-dẹp)
- [Checklist production](#checklist-production)
- [Troubleshooting](#troubleshooting)
- [Tài liệu chính thức](#tài-liệu-chính-thức)
- [Các bài liên quan](#các-bài-liên-quan)

## Mô hình đe dọa và mục tiêu

Secret là dữ liệu xác thực còn giá trị sử dụng: API token, private key, mật khẩu registry hoặc passphrase ký. Mục tiêu không chỉ là “không hiện secret trong YAML”. Một thiết kế production phải giới hạn được **ai**, **workflow nào**, **job nào**, **thời điểm nào** và **tài nguyên nào** có thể sử dụng credential.

### Tài sản và chủ thể cần xem xét

Lập threat model cho từng credential trước khi đưa nó vào GitHub Actions:

| Thành phần | Câu hỏi bắt buộc |
|---|---|
| Credential | Nó cấp quyền đọc hay ghi gì, ở account nào, có thể cấp tiếp token khác không? |
| Workflow và script | Ai có thể sửa `.github/workflows/**`, local action, script deploy hoặc dependency được thực thi? |
| Event | Dữ liệu nào đến từ fork, issue, tiêu đề PR, branch name hoặc input thủ công? |
| Runner | Runner có bền vững không, có dùng chung giữa repository không, truy cập được mạng nội bộ nào? |
| Action bên thứ ba | Source đã được review và pin full commit SHA chưa, action có cần secret này không? |
| Hệ thống đích | Có giới hạn IP, audience, TTL, scope, namespace và audit log hay không? |
| Con người | Ai tạo, rotate, approve, revoke và điều tra khi credential bị lộ? |

Một người có quyền ghi repository có thể sửa workflow để sử dụng repository secret dù không đọc được plaintext trong Settings. Vì vậy, về mặt threat model, **write access gần tương đương khả năng sử dụng repository secrets**. Environment approval, branch protection, ruleset và `CODEOWNERS` giúp giảm rủi ro nhưng không thay thế việc thu hẹp quyền của credential ở hệ thống nguồn.

### Ranh giới tin cậy

```text
Người hoặc event kích hoạt
          │
          ▼
Workflow YAML ──► action và script ──► runner ──► mạng và hệ thống đích
     │                 │                  │
     │                 │                  └─ workspace, process, file tạm
     │                 └─ dependency thực thi với quyền của job
     └─ chọn scope, environment, permissions và secret được cấp

GitHub secret store ── cấp giá trị sau khi policy đạt ──► job
External provider  ── kiểm tra credential hoặc OIDC ───► quyền thực tế
```

GitHub bảo vệ giá trị khi lưu bằng Libsodium sealed boxes và không cho đọc lại plaintext qua giao diện hoặc API. Ranh giới đó kết thúc khi giá trị được đưa vào runtime. Từ thời điểm này, mọi code trong vùng tin cậy của job có thể trở thành đường rò rỉ.

### Kịch bản tấn công chính

| Mối đe dọa | Ví dụ | Kiểm soát chính | Bằng chứng cần giữ |
|---|---|---|---|
| Workflow độc hại | Commit thêm lệnh gửi token tới domain ngoài | Ruleset, review bắt buộc, `CODEOWNERS`, environment approval, egress allowlist | PR review, workflow diff, deployment review |
| Supply-chain compromise | Tag của action bị di chuyển hoặc action bị chiếm quyền | Pin full SHA, review source, allowlist action, quyền tối thiểu | SHA đã phê duyệt, dependency review |
| Script injection | Tiêu đề PR được chèn trực tiếp vào `run` | Không chạy context không tin cậy như code; dùng biến trung gian và quote | Negative test với input độc hại |
| Runner bị chiếm | Fork PR chạy trên self-hosted runner có mạng production | Runner tách theo trust zone, ephemeral hoặc JIT, không cấp secret cho code không tin cậy | Runner group policy, network log |
| Rò qua dữ liệu bền vững | Token nằm trong artifact, cache, summary hoặc debug bundle | Không ghi secret ra file/output; scan log và artifact; retention ngắn | Run review, artifact inventory |
| Credential sống quá lâu | Cloud key không rotate trong nhiều tháng | OIDC hoặc token ngắn hạn, owner và lịch rotation | Provider audit log, rotation record |
| Cấu hình scope sai | Production token tồn tại ở repository secret | Chỉ lưu ở environment `production`, review trùng tên ở mọi cấp | Secret inventory theo scope |

<Callout type="error" title="Không có secret nào an toàn trước code độc hại đã được cấp quyền">
  Masking chỉ thay nội dung hiển thị trong log. Nó không ngăn `curl`, DNS, artifact upload, cache poisoning hoặc API call hợp lệ gửi dữ liệu ra ngoài. Kiểm soát quan trọng nhất là không cấp secret cho code và runner không đáng tin cậy.
</Callout>

## Phạm vi và độ ưu tiên của secrets

GitHub Actions hỗ trợ secret ở ba phạm vi chính. Chọn phạm vi hẹp nhất vẫn đáp ứng tác vụ.

| Phạm vi | Khi nên dùng | Ranh giới truy cập | Rủi ro thường gặp |
|---|---|---|---|
| Repository | Một repository duy nhất cần credential | Workflow trong repository đó | Mọi workflow đặc quyền cùng thấy tên secret và có thể tham chiếu nó |
| Environment | Credential gắn với `staging`, `production` hoặc đích triển khai | Chỉ job khai báo đúng environment, sau protection rules | Đặt nhầm tên environment hoặc sao chép cùng credential lên scope rộng hơn |
| Organization | Nhiều repository cần credential dùng chung | `all`, `private` hoặc danh sách repository được chọn | Blast radius lớn và repository mới vô tình được cấp quyền |

### Repository secrets

Repository secret phù hợp với credential chỉ phục vụ một repository, ví dụ token đọc dependency của ứng dụng đó. Tạo tại **Settings → Secrets and variables → Actions → Secrets**.

Repository secret không tự biến thành biến môi trường. Workflow phải tham chiếu `${{ secrets.NAME }}` rồi truyền vào `env` hoặc `with`. Tuy vậy, người có khả năng merge thay đổi workflow có thể thêm tham chiếu này. Bảo vệ đường thay đổi workflow quan trọng không kém bảo vệ Settings.

Không dùng repository secret cho production credential nếu chỉ deployment job cần nó. Scope này không có approval theo environment và dễ bị một job khác sử dụng nhầm.

### Environment secrets

Environment secret chỉ khả dụng cho job có `jobs.<job_id>.environment`. Nếu environment có protection rules, job phải vượt qua tất cả rule trước khi được chạy hoặc truy cập secret.

```yaml
jobs:
  deploy:
    environment: production
    runs-on: ubuntu-latest
    steps:
      - name: Deploy bằng credential production
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
        run: ./deploy-trusted-artifact.sh
```

Build, lint và test không cần khai báo `environment: production`. Tách job giúp production secret không đi vào vùng chạy compiler, package lifecycle script hoặc test do contributor kiểm soát.

### Organization secrets

Organization owner có thể chia sẻ một secret theo ba policy:

- **Selected repositories:** chỉ repository được chỉ định; đây là lựa chọn mặc định nên ưu tiên trong production.
- **Private repositories:** mọi private repository được quyền dùng. GitHub Free không cung cấp organization-level secrets cho private repositories.
- **All repositories:** phạm vi rộng nhất, bao gồm repository sẽ được tạo sau này nếu policy vẫn áp dụng.

Organization secret hữu ích cho credential đọc có blast radius đã được chấp nhận. Nó không phù hợp để chia sẻ một admin token cho toàn tổ chức. Nếu nhiều repository cần quyền khác nhau, hãy phát hành credential riêng hoặc dùng OIDC để hệ thống đích đánh giá identity của từng repository.

### Trùng tên thời điểm đọc và giới hạn

Khi cùng một tên tồn tại ở nhiều cấp, cấp thấp hơn thắng:

```text
Environment secret  >  Repository secret  >  Organization secret
```

Ví dụ, job dùng environment `production` sẽ nhận `DEPLOY_TOKEN` của environment đó thay vì secret cùng tên ở repository. Precedence tiện cho override nhưng dễ gây rotation nhầm. Audit phải kiểm tra cả ba cấp và tên environment thực tế của job.

GitHub đọc secret ở các thời điểm khác nhau:

- organization và repository secrets được đọc khi workflow run được đưa vào hàng đợi;
- environment secrets được đọc khi job tham chiếu environment bắt đầu.

Sau một rotation khẩn cấp, hãy hủy các run cũ đang queued hoặc pending và tạo run mới. Đừng giả định chúng tự nhận giá trị mới.

Giới hạn hiện hành được GitHub công bố:

- tối đa 1.000 organization secrets;
- tối đa 100 repository secrets;
- tối đa 100 secrets cho mỗi environment;
- mỗi giá trị tối đa 48 KB;
- nếu repository được cấp hơn 100 organization secrets, workflow chỉ nhận 100 tên đầu tiên theo thứ tự alphabet.

Tên secret chỉ chứa chữ cái, chữ số và `_`; không bắt đầu bằng số hoặc `GITHUB_`; không phân biệt hoa thường và được GitHub lưu dạng chữ hoa.

## Bảo vệ environment và approval

### Approval là cổng cấp secret

Required reviewers cho environment cho phép chọn tối đa sáu user hoặc team. Chỉ **một** reviewer trong danh sách cần approve để job tiếp tục. Bật **Prevent self-review** để actor khởi tạo run không tự duyệt chính run đó.

Luồng cấp secret production nên như sau:

```text
Build và test không secret
          ↓
Tạo hoặc chọn artifact bất biến
          ↓
Job yêu cầu environment production
          ↓
Ref policy + reviewer + wait timer + custom rule
          ↓
GitHub mới cho job truy cập environment secrets
          ↓
Deploy và ghi deployment status
```

Reviewer không nhìn thấy giá trị secret. Approval chỉ cho phép job bắt đầu với secret. Nếu workflow đã bị sửa để exfiltrate, reviewer vẫn có thể vô tình cấp quyền cho code độc hại. Vì vậy, review deployment phải đối chiếu commit SHA, workflow diff, artifact digest, kết quả kiểm thử và đích triển khai.

<Callout type="warn" title="Approval không bảo vệ bản sao ở scope rộng hơn">
  Nếu cùng production credential còn tồn tại ở repository hoặc organization secret, job khác có thể lấy bản sao đó mà không đi qua environment gate. Production credential chỉ nên tồn tại ở environment production hoặc được cấp động sau gate.
</Callout>

### Thiết kế environment production

Một baseline production nên có:

1. tên environment cố định, ví dụ `production`, không nhận chuỗi tùy ý từ input;
2. selected branch hoặc tag policy chỉ cho ref phát hành đáng tin cậy;
3. required reviewer là team có ownership và lịch trực rõ ràng;
4. prevent self-review;
5. không cho administrator bypass nếu policy không có break-glass;
6. custom protection rule khi cần kiểm tra change ticket, freeze window hoặc SLO ngoài GitHub;
7. secret chỉ cấp quyền cho đúng account, namespace hoặc service production;
8. concurrency hoặc lock phía deployment controller để tránh hai deploy đồng thời.

Nếu workflow tham chiếu một environment chưa tồn tại, GitHub có thể tự tạo environment không có protection rule và secret. Lỗi chính tả như `prodution` vì vậy là lỗi bảo mật. Dùng tên cố định, input kiểu `environment` khi thật sự cần chọn, và giám sát environment mới.

Khả dụng của required reviewers, wait timer và environment cho private repository phụ thuộc GitHub plan. Kiểm tra trang **Managing environments for deployment** tương ứng GitHub.com hoặc đúng phiên bản GHES trước khi đưa rule vào policy bắt buộc.

## Dùng secrets context an toàn

### Chỉ cấp cho step cần thiết

Mẫu ưu tiên là ánh xạ từng secret vào `env` ở đúng step cần dùng:

```yaml
- name: Đăng nhập registry qua STDIN
  shell: bash
  env:
    REGISTRY_USER: ${{ vars.REGISTRY_USER }}
    REGISTRY_PASSWORD: ${{ secrets.REGISTRY_PASSWORD }}
  run: |
    set -euo pipefail
    set +x
    test -n "${REGISTRY_PASSWORD:-}" || {
      echo "::error::REGISTRY_PASSWORD không khả dụng."
      exit 1
    }
    printf '%s' "$REGISTRY_PASSWORD" |
      docker login ghcr.io --username "$REGISTRY_USER" --password-stdin
```

Không chèn expression trực tiếp vào script như `run: tool '${{ secrets.TOKEN }}'`. GitHub thay expression trước khi shell chạy; ký tự đặc biệt có thể phá cú pháp. Không truyền secret qua command-line argument nếu tool hỗ trợ `STDIN`, file descriptor hoặc credential helper, vì process list và audit của hệ điều hành có thể lưu argument.

`with:` cũng không tạo ranh giới an toàn hơn `env`. Action nhận input vẫn có thể log hoặc gửi nó qua mạng. Review source action trước khi truyền secret.

Giữ secret ở step-level thay vì workflow-level hoặc job-level `env`. Mọi process trong step vẫn có thể thừa hưởng environment, nên step đặc quyền phải nhỏ và không chạy dependency không cần thiết.

### Điều kiện và secret bị thiếu

Không thể tham chiếu `secrets.*` trực tiếp trong khóa `if`. Nếu cần một nhánh tùy chọn, ánh xạ secret vào job-level `env`, rồi kiểm tra `env.NAME`. Đổi lại, mọi step trong job sẽ có phạm vi rộng hơn, nên hãy giữ job ngắn.

```yaml
jobs:
  optional-publish:
    runs-on: ubuntu-latest
    env:
      PUBLISH_TOKEN: ${{ secrets.PUBLISH_TOKEN }}
    steps:
      - name: Publish khi credential khả dụng
        if: ${{ env.PUBLISH_TOKEN != '' }}
        run: ./publish-with-token-from-env.sh

      - name: Bỏ qua an toàn
        if: ${{ env.PUBLISH_TOKEN == '' }}
        run: echo "Không publish vì credential không khả dụng."
```

Nếu secret chưa tồn tại hoặc không được cấp trong context hiện tại, `${{ secrets.NAME }}` trả về chuỗi rỗng. Tác vụ nhạy cảm phải **fail closed**. Không fallback sang anonymous access, credential mặc định trên self-hosted runner hoặc account khác.

### Pull request từ fork

Ngoại trừ `GITHUB_TOKEN`, stored secrets không được truyền tới runner khi workflow được kích hoạt từ fork. `GITHUB_TOKEN` trong fork PR thường chỉ có quyền đọc. Đây là ranh giới an toàn có chủ đích.

Thiết kế đúng:

- `pull_request` chạy lint, build và test không cần secret;
- publish hoặc deploy chạy sau merge từ ref được bảo vệ;
- job đặc quyền dùng environment approval;
- artifact từ workflow không tin cậy phải được xác minh trước khi workflow đặc quyền xử lý.

Không đổi sang `pull_request_target` chỉ để lấy secret. Trigger này chạy trong context nhánh đích và có thể có quyền ghi hoặc secret. Nếu workflow checkout PR head hay chạy script từ fork, attacker có thể chiếm credential và repository.

<Callout type="error" title="Approve PR run không làm code fork trở nên đáng tin cậy">
  Phê duyệt cho workflow của contributor chạy chỉ cho phép run bắt đầu theo policy repository. Không nên dùng thao tác đó như lý do để cấp production secret cho code từ fork.
</Callout>

### Dependabot

Run do Dependabot kích hoạt từ `push`, `pull_request`, `pull_request_review` hoặc `pull_request_review_comment` được xử lý tương tự fork: `GITHUB_TOKEN` chỉ đọc và GitHub Actions secrets không khả dụng. Chỉ **Dependabot secrets** được đưa vào `secrets` context.

Nếu Dependabot cần đọc private registry:

- tạo Dependabot secret cùng tên với Actions secret nếu một workflow dùng chung cú pháp;
- chỉ cấp quyền đọc package;
- ưu tiên OIDC cho registry được Dependabot hỗ trợ;
- hoặc bỏ qua riêng step cần credential bằng điều kiện `github.actor != 'dependabot[bot]'`.

Không tăng thành token ghi chỉ để dependency update có CI màu xanh. Manual rerun của Dependabot workflow vẫn giữ privilege của run ban đầu.

### Reusable workflows

Secrets **không tự động truyền vào reusable workflow**. Cách an toàn nhất là khai báo contract và truyền từng secret tường minh.

Called workflow:

```yaml
name: Reusable publish

on:
  workflow_call:
    secrets:
      package_token:
        description: Token chỉ được ghi package của repository đích
        required: true

permissions: {}

jobs:
  publish:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - name: Checkout revision đã gọi workflow
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803

      - name: Publish
        env:
          PACKAGE_TOKEN: ${{ secrets.package_token }}
        run: ./publish-trusted-package.sh
```

Caller workflow:

```yaml
jobs:
  call-publish:
    uses: ./.github/workflows/reusable-publish.yml
    secrets:
      package_token: ${{ secrets.PACKAGE_TOKEN }}
```

`secrets: inherit` truyền toàn bộ secrets mà caller có thể truy cập tới workflow được gọi trực tiếp. Nó chỉ dùng được giữa workflows trong cùng organization hoặc enterprise. Called workflow có thể tham chiếu secret được inherit ngay cả khi không khai báo tên trong `on.workflow_call.secrets`.

```yaml
jobs:
  call-reviewed-workflow:
    # Chỉ dùng inherit khi workflow này là first-party, đã review và có contract rõ.
    uses: octo-org/platform-workflows/.github/workflows/deploy.yml@0123456789abcdef0123456789abcdef01234567
    secrets: inherit
```

Dùng `secrets: inherit` có kiểm soát chỉ khi **tất cả** điều sau đúng:

- reusable workflow là first-party và ownership rõ ràng;
- tham chiếu cross-repository được pin full commit SHA đã review;
- caller không có secret thừa hoặc quyền cao không liên quan;
- thay đổi caller và called workflow đều qua review bảo mật;
- audit đã xác nhận workflow không chuyển secret tiếp hoặc gửi ra domain ngoài;
- lợi ích vận hành thực sự lớn hơn rủi ro contract ngầm.

Trong chuỗi A gọi B gọi C, secret chỉ đi tới workflow được gọi trực tiếp. B phải truyền tiếp rõ ràng nếu C cần. `inherit` từ A sang B không tự lan tới C.

Environment secrets không thể được truyền từ caller qua `on.workflow_call`, vì khóa này không hỗ trợ `environment`. Nếu called workflow khai báo environment ở cấp job, environment secret của called workflow được dùng và có thể ghi đè secret cùng tên caller truyền vào. Đặt ranh giới environment ở workflow sở hữu deployment và review precedence cẩn thận.

## Masking và ngăn rò rỉ

### Masking làm được và không làm được gì

GitHub tự động redact nội dung GitHub secrets và một số định dạng nhạy cảm đã nhận diện trong workflow log, thường thành `***`. Runner chỉ có thể redact secret mà nó biết trong **job hiện tại**. Redaction không được bảo đảm vì một secret có thể bị biến đổi theo nhiều cách.

Masking có thể thất bại khi:

- giá trị bị Base64, URL-encode, hash, cắt nhỏ hoặc nối chuỗi;
- JSON, XML hoặc YAML lớn chứa nhiều trường bí mật được lưu như một secret duy nhất;
- token ngắn hạn được sinh trong runtime nhưng chưa đăng ký mask;
- secret xuất hiện trước lệnh `add-mask`;
- tool ghi vào `STDERR` theo format khác;
- dữ liệu đi vào artifact, cache, summary, file, telemetry hoặc network thay vì log;
- giá trị được dùng ở job khác, nơi runner chưa biết mask đó.

Base64 là encoding, không phải encryption. `***` chỉ chứng minh chuỗi đã bị che ở vị trí log đó. Nó không chứng minh secret chưa bị exfiltrate.

### Chặn log leak và exfiltration

Áp dụng đồng thời các lớp sau:

1. **Không tạo log nhạy cảm:** tắt `set -x`, verbose HTTP, dump environment, debug bundle và request header.
2. **Giới hạn step:** chỉ step sử dụng secret mới nhận `env`; không để test hoặc package lifecycle script chạy sau khi secret được cấp.
3. **Không ghi nơi bền vững:** không đưa secret vào `$GITHUB_OUTPUT`, `$GITHUB_ENV`, `$GITHUB_STEP_SUMMARY`, artifact, cache, image layer hoặc test snapshot.
4. **Giới hạn mạng:** dùng runner group và egress allowlist cho job đặc quyền. Cho phép đúng API đích, DNS và endpoint cần thiết.
5. **Review dependency thực thi:** pin action bên thứ ba vào full-length commit SHA, xác minh SHA thuộc repository gốc và review source.
6. **Tách trust zone:** fork PR không chạy trên self-hosted runner có mạng production. Runner production nên ephemeral hoặc JIT và được làm sạch thật sự.
7. **Bảo vệ input:** không chèn title, body, branch, tag hoặc input do người dùng kiểm soát trực tiếp vào `run`.
8. **Kiểm tra cả đường lỗi:** tool có thể in request, response hoặc credential ra `STDERR` chỉ khi xác thực thất bại.

Ví dụ xử lý input không tin cậy:

```yaml
- name: Kiểm tra tiêu đề PR như dữ liệu
  shell: bash
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: printf '%s\n' "$PR_TITLE" | ./check-title.sh
```

Cách này tránh biến title thành source code Bash. Nó không làm `check-title.sh` tự động an toàn; script vẫn phải xử lý input đúng cách.

### Mask giá trị phát sinh

Token phát sinh trong job, chẳng hạn access token lấy từ external secret manager, phải được mask ngay sau khi nhận và trước lệnh có thể ghi log:

```yaml
- name: Nhận và sử dụng token ngắn hạn
  shell: bash
  env:
    BOOTSTRAP_CREDENTIAL: ${{ secrets.BOOTSTRAP_CREDENTIAL }}
  run: |
    set -euo pipefail
    set +x

    access_token="$({
      printf '%s' "$BOOTSTRAP_CREDENTIAL" |
        ./issue-short-lived-token --credential-stdin
    })"
    echo "::add-mask::$access_token"

    printf '%s' "$access_token" | ./deploy --token-stdin
    unset access_token BOOTSTRAP_CREDENTIAL
```

Đăng ký cả dạng biến đổi nếu bắt buộc dùng Base64 hoặc URL-encoded. Tốt hơn là không in bất kỳ dạng nào. Nếu cần chuyển một credential giữa jobs, lưu nó vào secret manager và chỉ truyền **opaque handle**; job sau tự xác thực rồi đọc lại. Không coi output đã mask là kênh truyền secret an toàn.

## Quản lý bằng GitHub CLI

### Tạo cập nhật liệt kê và xóa

Kiểm tra đúng account và repository trước khi thao tác:

```bash
gh auth status
gh repo view --json nameWithOwner
```

Tạo hoặc cập nhật repository secret bằng prompt ẩn:

```bash
gh secret set PACKAGE_READ_TOKEN
```

Tạo giá trị ngẫu nhiên mà không in ra terminal, rồi truyền qua `STDIN`:

```bash
openssl rand -hex 32 | gh secret set ACTIONS_LAB_TOKEN
```

Tạo environment secret:

```bash
openssl rand -hex 32 |
  gh secret set DEPLOY_TOKEN --env production --repo octo-org/example-repo
```

Quản lý organization secret cần quyền organization phù hợp và scope `admin:org` cho GitHub CLI:

```bash
gh auth refresh -h github.com -s admin:org

gh secret set SHARED_PACKAGE_TOKEN \
  --org octo-org \
  --repos api-service,worker-service
```

Nếu thực sự cần cấp cho mọi repository, policy phải được viết rõ trong review:

```bash
gh secret set SHARED_READ_TOKEN --org octo-org --visibility all
```

Liệt kê chỉ trả về tên và metadata, không trả plaintext:

```bash
gh secret list
gh secret list --env production
gh secret list --org octo-org
```

Xóa bản lưu trên GitHub:

```bash
gh secret delete PACKAGE_READ_TOKEN
gh secret delete DEPLOY_TOKEN --env production
gh secret delete SHARED_PACKAGE_TOKEN --org octo-org
```

<Callout type="error" title="Xóa trên GitHub không revoke credential nguồn">
  Nếu secret là token của cloud, registry hoặc SaaS, hãy revoke tại hệ thống phát hành. `gh secret delete` chỉ xóa bản lưu dùng bởi Actions; token bị đánh cắp vẫn hoạt động cho tới khi provider vô hiệu nó hoặc token hết hạn.
</Callout>

Tránh `--body "value"` vì command-line argument có thể vào shell history, process list hoặc endpoint audit. `gh secret set -f .env` tiện cho bootstrap nhưng dễ tạo file plaintext chứa nhiều credential. Nếu buộc phải dùng, file phải nằm ngoài Git, có quyền `0600`, tồn tại ngắn và được xóa theo quy trình an toàn.

### Quy ước tên và dữ liệu lớn

Tên nên thể hiện **mục đích**, không chứa environment nếu environment đã là scope. Ví dụ:

- tốt: environment `production` có `DEPLOY_TOKEN`;
- khó vận hành: repository có `PROD_DEPLOY_TOKEN_V2_NEW`;
- tốt: `PACKAGE_READ_TOKEN` và `PACKAGE_WRITE_TOKEN` tách quyền;
- không tốt: một `CREDENTIALS_JSON` chứa username, password và private key.

Không lưu structured data lớn trong một secret. Redaction chủ yếu dựa trên exact match nên từng trường trong JSON có thể không được che như mong đợi. Tách thành các secret nguyên tử để rotation, ownership và masking rõ hơn.

Với dữ liệu lớn hơn 48 KB, GitHub Docs mô tả cách lưu file đã mã hóa và giữ passphrase trong secret. Trong production, external secret manager thường tốt hơn vì có access policy, version, TTL và audit. Nếu dùng file mã hóa, GitHub không tự redact nội dung plaintext sau giải mã; không in file và phải xóa file tạm.

## Chọn đúng cơ chế xác thực

Không phải dữ liệu nào cũng nên trở thành stored secret.

| Nhu cầu | Cơ chế ưu tiên | Lý do |
|---|---|---|
| URL, region, account ID công khai | GitHub Actions variable | Không bí mật, dễ quan sát và thay đổi |
| API trong chính repository | `GITHUB_TOKEN` | Tự cấp theo job, hết hạn tự động, quyền điều khiển bằng `permissions` |
| Cloud hoặc Vault hỗ trợ federation | OIDC | Không lưu cloud key dài hạn; token ngắn hạn theo identity job |
| GitHub API ngoài repository hoặc automation theo service identity | GitHub App | Permission chi tiết, installation token ngắn hạn, không gắn vòng đời nhân viên |
| Nhiều secret động, policy tập trung, rotation thường xuyên | External secret manager kết hợp OIDC | Cấp theo yêu cầu, audit và revoke tập trung |
| Một credential tĩnh nhỏ cho một repository | Repository hoặc environment secret | Đơn giản, tích hợp trực tiếp; vẫn cần rotation |

### Variables và GITHUB_TOKEN

Dùng `${{ vars.NAME }}` cho dữ liệu không nhạy cảm như URL, region, feature flag hoặc role ARN. Variable không có bảo đảm bí mật và có thể xuất hiện trong log, expression hoặc giao diện. Không đặt password, bearer token hoặc private key trong `vars`.

`GITHUB_TOKEN` là installation access token GitHub tự tạo cho mỗi job, không phải stored secret do bạn quản lý. Ưu tiên nó khi thao tác trong repository hiện tại và thu hẹp quyền:

```yaml
permissions: {}

jobs:
  report:
    permissions:
      contents: read
      issues: write
    runs-on: ubuntu-latest
    steps:
      - name: Tạo issue
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh issue create --title "Báo cáo run $GITHUB_RUN_ID" --body "Xem Actions để biết chi tiết."
```

Action có thể truy cập `github.token` dù workflow không truyền token tường minh. Vì vậy, `permissions` tối thiểu vẫn bắt buộc với mọi job dùng action bên thứ ba.

### OIDC

Dùng OpenID Connect khi cloud provider, artifact registry hoặc secret manager hỗ trợ federation. Job yêu cầu OIDC JWT từ GitHub rồi đổi nó lấy credential ngắn hạn. Không cần lưu access key dài hạn trong GitHub.

```text
Job với id-token write
        ↓ yêu cầu OIDC JWT
GitHub OIDC provider
        ↓ JWT có repository ref environment workflow claims
Cloud hoặc secret manager
        ↓ kiểm tra issuer audience subject và policy
Token ngắn hạn cho đúng role
```

Workflow chỉ mở `id-token: write` cho job cần federation:

Ví dụ AWS dưới đây dùng SHA được GitHub Docs công bố cho `aws-actions/configure-aws-credentials` tại thời điểm rà soát năm 2026. Role ARN và region là cấu hình không bí mật nên được lưu trong environment variables.

```yaml
permissions: {}

jobs:
  verify-aws-identity:
    environment: production
    permissions:
      id-token: write
    runs-on: ubuntu-latest
    steps:
      - name: Đổi OIDC token lấy AWS credential ngắn hạn
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502
        with:
          role-to-assume: ${{ vars.AWS_ROLE_ARN }}
          role-session-name: github-actions-production
          aws-region: ${{ vars.AWS_REGION }}

      - name: Xác nhận role không in token
        run: aws sts get-caller-identity --query Arn --output text
```

`id-token: write` chỉ cho phép yêu cầu OIDC token; quyền tài nguyên đến từ trust policy và role phía provider. Với AWS, trust policy phải kiểm tra audience `sts.amazonaws.com` và subject gắn với đúng repository hoặc environment `production`. Với provider khác, kiểm tra `aud`, `sub` và claims tương đương. Không dùng wildcard toàn organization để xử lý nhanh lỗi assume-role.

### GitHub App

Dùng `GITHUB_TOKEN` trước. Khi workflow cần truy cập nhiều repository, tài nguyên organization hoặc permission mà `GITHUB_TOKEN` không đáp ứng, GitHub App thường an toàn hơn PAT của tài khoản cá nhân:

- quyền chi tiết theo loại tài nguyên;
- cài đặt trên đúng repository cần truy cập;
- installation token ngắn hạn;
- service identity không ngừng hoạt động khi nhân viên rời tổ chức.

Client ID của App là variable. Private key là secret bootstrap và vẫn phải rotate, hoặc được giữ trong external manager. Tạo installation token trong đúng job cần dùng và mask token phát sinh. Không cấp App quyền organization-wide nếu workflow chỉ cần hai repository.

### External secret manager

Chọn Vault, cloud secret manager hoặc hệ thống nội bộ khi cần:

- version và rotation tập trung;
- credential động có TTL ngắn;
- policy theo repository, environment, branch hoặc workload identity;
- revoke ngay trên một control plane;
- audit từng lần đọc và từng tài nguyên được truy cập;
- chia sẻ an toàn cho nhiều nền tảng ngoài GitHub Actions.

Mẫu tốt là GitHub job dùng OIDC để xác thực với secret manager, sau đó chỉ đọc đúng path cần thiết. Token phát sinh được mask ngay và chỉ tồn tại trong job. Không dùng một root token dài hạn làm GitHub organization secret để “kết nối Vault”; cách đó chỉ chuyển bài toán static secret sang credential có blast radius lớn hơn.

External manager tăng độ phức tạp: availability, latency, policy, network và runbook sự cố đều trở thành dependency của pipeline. Thiết kế fail closed và không tự fallback sang credential tĩnh khi manager lỗi.

## Workflow production an toàn

### Các quyết định thiết kế

Workflow dưới đây minh họa một deployment API đơn giản:

- chỉ chạy thủ công từ default branch;
- `permissions: {}` vì không cần GitHub API;
- job tham chiếu environment `production` để nhận approval và secret;
- không checkout source, không chạy action bên thứ ba;
- secret chỉ tồn tại ở một step;
- tắt shell tracing và fail khi secret rỗng;
- đưa bearer token vào file header tạm quyền hạn chế thay vì command-line argument;
- xóa file bằng `trap`;
- response body không được ghi vào log;
- có timeout và concurrency cho production.

Trong hệ thống thật, endpoint phải có idempotency, xác minh `GITHUB_SHA`, quyền tối thiểu và audit. Egress runner nên chỉ cho phép domain deployment API.

### Workflow hoàn chỉnh

```yaml
name: Production deployment
run-name: "Deploy ${{ github.sha }} by @${{ github.actor }}"

on:
  workflow_dispatch:

permissions: {}

jobs:
  deploy:
    name: Deploy approved revision
    if: ${{ github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: production
    concurrency:
      group: production-deployment
      cancel-in-progress: false

    steps:
      - name: Call trusted deployment API
        shell: bash
        env:
          DEPLOY_API_TOKEN: ${{ secrets.DEPLOY_API_TOKEN }}
          DEPLOY_API_URL: ${{ vars.DEPLOY_API_URL }}
          REVISION: ${{ github.sha }}
          RUN_ID: ${{ github.run_id }}
        run: |
          set -euo pipefail
          set +x
          umask 077

          if [[ -z "${DEPLOY_API_TOKEN:-}" ]]; then
            echo "::error::DEPLOY_API_TOKEN không khả dụng."
            exit 1
          fi
          if [[ ! "${DEPLOY_API_URL:-}" =~ ^https:// ]]; then
            echo "::error::DEPLOY_API_URL phải là HTTPS URL đã được phê duyệt."
            exit 1
          fi

          header_file="$(mktemp)"
          cleanup() {
            rm -f "$header_file"
            unset DEPLOY_API_TOKEN token
          }
          trap cleanup EXIT

          token="$DEPLOY_API_TOKEN"
          unset DEPLOY_API_TOKEN
          printf 'Authorization: Bearer %s\n' "$token" > "$header_file"
          unset token

          curl \
            --fail \
            --silent \
            --show-error \
            --output /dev/null \
            --request POST \
            --header "@$header_file" \
            --header 'Content-Type: application/x-www-form-urlencoded' \
            --data-urlencode "revision=$REVISION" \
            --data-urlencode "github_run_id=$RUN_ID" \
            "${DEPLOY_API_URL%/}/deploy"

          echo "Deployment API đã chấp nhận revision $REVISION."
```

`DEPLOY_API_URL` là variable, không phải secret. Quản trị viên vẫn phải bảo vệ thay đổi variable vì đổi URL có thể chuyển credential sang endpoint của attacker. Tốt hơn nữa, network policy và deployment API cùng enforce allowlist thay vì chỉ dựa vào kiểm tra `https://` trong shell.

Nếu deploy phải chạy script trong repository, build và kiểm thử artifact trước khi cấp secret. Job production chỉ tải artifact bất biến đã ký hoặc attest, xác minh digest rồi triển khai. Không checkout lại và chạy code tùy ý sau approval.

### Cách kiểm chứng

- [ ] Run từ branch khác default không chạy job.
- [ ] Job ở trạng thái waiting trước khi reviewer approve.
- [ ] Actor khởi tạo không tự approve được khi prevent self-review bật.
- [ ] Không step nào chạy trước khi protection rules đạt.
- [ ] Secret thiếu làm job fail với tên secret, không in giá trị.
- [ ] Log không chứa request header, bearer token, response body hoặc dump environment.
- [ ] Deployment API ghi nhận đúng revision, run ID và identity của credential.
- [ ] Chỉ một deployment production chạy trong cùng concurrency group.
- [ ] Runner không truy cập được domain ngoài allowlist của job đặc quyền.

Workflow không thể tự chứng minh không exfiltrate. Cần kết hợp source review, network log, provider audit log và test đường lỗi.

## Rotation thu hồi và ứng phó sự cố

### Rotation có kế hoạch

Mỗi secret production cần metadata ngoài giá trị: owner, provider, scope, consumer, ngày tạo, ngày rotate tiếp theo, TTL, cách revoke và contact on-call.

Quy trình rotation không downtime:

<Steps>
<Step>

Tạo credential mới ở provider với quyền bằng hoặc hẹp hơn credential cũ. Không sửa credential cũ tại chỗ nếu provider hỗ trợ hai credential đồng thời.

</Step>
<Step>

Cập nhật đúng scope bằng `gh secret set`. Kiểm tra trùng tên ở organization, repository và environment trước khi kết luận đã cập nhật đúng giá trị.

</Step>
<Step>

Hủy run cũ đang queued hoặc pending, rồi tạo run mới. Điều này đặc biệt quan trọng vì organization và repository secrets được đọc khi run vào hàng đợi.

</Step>
<Step>

Chạy smoke test không in credential. Kiểm tra cả GitHub run, provider audit log và tài nguyên đích.

</Step>
<Step>

Revoke credential cũ tại provider ngay khi đường mới ổn định. Không giữ “dự phòng” vô thời hạn.

</Step>
<Step>

Ghi change record gồm actor, scope, secret name, provider credential ID, thời điểm activate và revoke. Không ghi plaintext hoặc hash có thể dùng để suy đoán secret yếu.

</Step>
</Steps>

Signing key hoặc credential không hỗ trợ overlap cần kế hoạch riêng: maintenance window, key set nhiều phiên bản, dual verification hoặc rollback đã thử nghiệm. Rotation chỉ thành công khi credential cũ không còn hợp lệ.

### Xử lý secret nghi bị lộ

Nếu secret xuất hiện trong log, artifact, commit, issue, PR hoặc network request bất thường, giả định nó đã bị sao chép:

1. hủy run đang chạy và cô lập self-hosted runner liên quan;
2. revoke credential ở provider trước;
3. vô hiệu role, account hoặc network path nếu chưa revoke ngay được;
4. tạo credential mới với quyền hẹp hơn và cập nhật đúng scope;
5. xóa workflow log, artifact, release asset hoặc cache chứa dữ liệu;
6. nếu nằm trong Git, xóa khỏi lịch sử khi cần, nhưng không trì hoãn revoke để rewrite history;
7. kiểm tra GitHub audit log, run ID, commit SHA, action SHA, provider audit log và egress log;
8. rotate token phát sinh hoặc credential cùng trust chain;
9. sửa workflow và diễn tập lại trước khi bật production.

<Callout type="error" title="Revoke trước xóa log">
  Xóa log làm giảm khả năng người khác nhìn thấy secret nhưng không vô hiệu bản sao attacker đã lấy. Revoke tại hệ thống nguồn mới chặn sử dụng tiếp.
</Callout>

## Secret scanning và push protection

### Secret scanning

GitHub secret scanning tìm credential hard-code trong toàn bộ Git history trên mọi branch và định kỳ quét lại khi có loại secret mới. GitHub cũng quét nhiều bề mặt cộng tác như issue, pull request, discussion, wiki và secret gist.

Với public repository, secret scanning chạy tự động và miễn phí. Organization-owned private hoặc internal repository cần GitHub Secret Protection trên plan được hỗ trợ. Khả dụng có thể khác trên GHES; đối chiếu tài liệu đúng phiên bản.

Bật thêm khi phù hợp:

- generic patterns cho private key, connection string và generic API key;
- custom patterns cho credential nội bộ;
- validity checks để biết credential còn hoạt động hay không;
- notification và delegated dismissal để alert không bị đóng thiếu kiểm soát.

Secret scanning là detective control. Nó không thay secret store, không bảo đảm phát hiện mọi định dạng và không nên được xem là cơ chế bảo vệ runtime log của Actions.

### Push protection

Push protection chặn credential đã nhận diện trước khi nó vào repository. Nó có thể chặn push từ command line, commit hoặc upload trên giao diện, REST API và một số tích hợp được GitHub hỗ trợ.

Đối với repository push protection, bypass tạo alert và audit event. Tổ chức có thể dùng delegated bypass để giới hạn ai được tự bypass hoặc phê duyệt yêu cầu bypass. Policy production nên:

- bật push protection ở organization hoặc enterprise;
- chỉ cho security team hoặc nhóm được ủy quyền review bypass;
- yêu cầu lý do và thời hạn xử lý;
- không dùng “I'll fix it later” cho credential có thật;
- giám sát actor được exemption vì họ có thể push mà không bị chặn.

Push protection không ngăn workflow tự in hoặc gửi secret runtime. Nó bảo vệ đường **đưa chuỗi giống credential vào repository**, không bảo vệ mọi kênh exfiltration.

### Xử lý alert

Khi có secret scanning alert hoặc push protection bypass:

1. xác định provider, credential ID, repository, location và actor;
2. revoke hoặc rotate ngay nếu có khả năng credential thật;
3. kiểm tra validity nhưng không trì hoãn revoke chỉ vì status chưa rõ;
4. tìm mọi bản sao trong branch, tag, issue, PR, artifact và hệ thống downstream;
5. đọc provider audit log từ thời điểm credential có thể đã lộ;
6. xóa khỏi code và lịch sử nếu policy yêu cầu;
7. chỉ đóng alert với reason chính xác cùng bằng chứng;
8. thêm custom pattern hoặc pre-commit guard nếu loại nội bộ chưa được nhận diện.

GitHub có thể báo partner secret cho provider để provider xử lý. Không giả định provider chắc chắn đã revoke; owner credential vẫn phải xác minh trạng thái ở hệ thống nguồn.

## Audit và governance

### Inventory và access review

Duy trì inventory không chứa plaintext với các trường:

| Trường | Ví dụ an toàn |
|---|---|
| Secret name | `DEPLOY_API_TOKEN` |
| Scope | environment `production` của `octo-org/payments-api` |
| Owner | team `payments-platform` |
| Provider resource | credential ID hoặc role name, không phải giá trị |
| Quyền | gọi deployment API cho service payments |
| Consumers | workflow file, reusable workflow và job |
| Rotation | 30 ngày hoặc dynamic TTL |
| Revoke runbook | URL nội bộ và on-call team |
| Last review | ngày, reviewer, quyết định giữ hoặc xóa |

Access review định kỳ phải trả lời:

- repository nào còn được organization secret cấp quyền;
- có secret cùng tên ở nhiều scope không;
- production environment có reviewer, ref policy và prevent self-review không;
- workflow nào tham chiếu mỗi tên secret;
- reusable workflow nào dùng `secrets: inherit`;
- action hoặc script nào nhận secret và gọi domain nào;
- credential provider còn quyền dư thừa hay owner đã rời team;
- secret nào có thể thay bằng variable, `GITHUB_TOKEN`, OIDC hoặc GitHub App.

`gh secret list` hỗ trợ inventory tên và metadata nhưng không cho biết plaintext. Kết hợp code search, reusable workflow contract và inventory ở provider. Không dựa vào tên một mình để kết luận secret còn được sử dụng.

### Bằng chứng và giám sát

GitHub organization audit log ghi actor, action và thời điểm cho nhiều thay đổi Actions. Ví dụ chính thức `org.update_actions_secret` theo dõi cập nhật organization secret. Dùng tài liệu **Audit log events for your organization** để chọn đúng event name hiện hành thay vì hard-code danh sách không được duy trì.

Audit production nên ghép bốn nguồn:

1. **GitHub audit log:** thay đổi secret policy, Actions settings, environment và bypass;
2. **workflow và deployment record:** run ID, actor, commit SHA, environment, reviewer và trạng thái;
3. **secret manager hoặc provider log:** ai hoặc workload nào đọc secret, token nào được phát hành, API nào được gọi;
4. **runner và network telemetry:** runner group, image, egress destination và thời điểm kết nối.

Audit log không chứa plaintext và không chứng minh credential chưa bị dùng ngoài GitHub. Provider log mới cho biết tác động thực tế. Gửi các sự kiện quan trọng tới SIEM, cảnh báo khi:

- organization secret đổi sang `all repositories`;
- production environment bị bỏ reviewer hoặc cho bypass;
- secret thay đổi ngoài change window;
- push protection bị bypass;
- workflow nhạy cảm thêm action mới hoặc chuyển từ SHA sang tag;
- provider thấy credential dùng từ identity, region hoặc thời điểm bất thường.

Với reusable workflows, GitHub Enterprise Cloud hỗ trợ audit qua API để theo dõi workflow được sử dụng. Pin called workflow bằng SHA giúp bằng chứng review không trôi theo branch hoặc tag.

## Bài thực hành

Bài lab chứng minh environment secret chỉ được cấp sau approval và workflow fail closed khi secret bị xóa. Chỉ dùng chuỗi ngẫu nhiên không có quyền ở bất kỳ hệ thống nào.

### Chuẩn bị

- [ ] Repository thử nghiệm có Actions và plan hỗ trợ environment rule cần dùng.
- [ ] Có quyền admin repository.
- [ ] Có reviewer độc lập để kiểm tra prevent self-review.
- [ ] Default branch được bảo vệ và workflow change qua review.
- [ ] GitHub CLI đã đăng nhập đúng repository.
- [ ] Không dùng API key, password hoặc token thật.

Tạo environment `production-lab` tại **Settings → Environments**:

1. thêm required reviewer;
2. bật prevent self-review;
3. chỉ cho default branch deploy;
4. không đặt credential thật;
5. tạo secret ngẫu nhiên qua `STDIN`:

```bash
openssl rand -hex 32 |
  gh secret set ACTIONS_LAB_TOKEN --env production-lab

gh secret list --env production-lab
```

Lệnh `list` chỉ phải hiển thị tên và metadata, không hiển thị giá trị.

### Workflow cho bài thực hành

Tạo `.github/workflows/secrets-lab.yml`:

```yaml
name: Secrets management lab

on:
  workflow_dispatch:

permissions: {}

jobs:
  validate-secret-boundary:
    if: ${{ github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    environment: production-lab
    steps:
      - name: Xác nhận secret tồn tại mà không in giá trị
        shell: bash
        env:
          ACTIONS_LAB_TOKEN: ${{ secrets.ACTIONS_LAB_TOKEN }}
        run: |
          set -euo pipefail
          set +x

          if [[ -z "${ACTIONS_LAB_TOKEN:-}" ]]; then
            echo "::error::ACTIONS_LAB_TOKEN không khả dụng."
            exit 1
          fi

          if (( ${#ACTIONS_LAB_TOKEN} < 32 )); then
            echo "::error::Secret lab không đạt độ dài tối thiểu."
            exit 1
          fi

          echo "Environment gate đạt; secret tồn tại và không được in."
```

Workflow không checkout source, không gọi action bên thứ ba, không tạo output, summary, cache hoặc artifact. Nó chỉ kiểm tra trạng thái và độ dài trong bộ nhớ.

### Các bước và tiêu chí đạt

<Steps>
<Step>

Commit workflow qua pull request và merge vào default branch. Review xác nhận file không có `echo`, `printenv`, `env`, `set -x` hoặc network command nhận secret.

</Step>
<Step>

Chạy workflow bằng `gh workflow run secrets-lab.yml`. Mở run và xác nhận job đang chờ environment review; step kiểm tra chưa bắt đầu.

</Step>
<Step>

Thử approve bằng actor đã khởi tạo run. Thao tác phải bị chặn khi prevent self-review bật. Sau đó dùng reviewer độc lập approve.

</Step>
<Step>

Xác nhận run thành công và log chỉ có câu thông báo an toàn. Không dán giá trị secret vào terminal để tìm kiếm log vì thao tác đó tự tạo thêm bản sao trong shell history.

</Step>
<Step>

Xóa secret, tạo run mới và approve. Run phải fail closed với thông báo `ACTIONS_LAB_TOKEN không khả dụng`, không fallback sang giá trị khác.

</Step>
</Steps>

Tiêu chí hoàn thành:

- [ ] Job không chạy trước approval.
- [ ] Actor không tự approve được.
- [ ] Reviewer độc lập approve được.
- [ ] Log không chứa giá trị, dạng Base64, hash hoặc một phần của secret.
- [ ] Không có artifact, cache, output hoặc summary chứa secret.
- [ ] Run mới thất bại an toàn sau khi secret bị xóa.
- [ ] Deployment history ghi đúng environment, actor, commit và trạng thái.
- [ ] Audit evidence không chứa plaintext.

### Dọn dẹp

Nếu chưa xóa ở negative test:

```bash
gh secret delete ACTIONS_LAB_TOKEN --env production-lab
```

Xóa workflow lab hoặc giữ làm kiểm tra regression tùy policy repository. Nếu xóa environment, lưu ý GitHub cũng xóa secrets và protection rules của environment; job đang chờ environment đó sẽ thất bại.

## Checklist production

- [ ] Mỗi secret có owner, purpose, scope, provider credential ID, TTL, rotation date và revoke runbook.
- [ ] Không có secret thật trong workflow, source, issue, PR, artifact, cache, image layer hoặc tài liệu.
- [ ] Dữ liệu không nhạy cảm nằm trong `vars`, không nằm trong secrets.
- [ ] Ưu tiên `GITHUB_TOKEN`, OIDC hoặc GitHub App trước PAT và cloud key dài hạn.
- [ ] Credential nguồn có least privilege, giới hạn account, namespace, repository và thời hạn.
- [ ] Production credential chỉ ở environment production hoặc được cấp động sau gate.
- [ ] Environment bật ref restriction, required reviewer và prevent self-review.
- [ ] Không có bản sao cùng credential ở scope rộng hơn.
- [ ] Secret chỉ được ánh xạ ở step cần dùng; không đặt ở workflow-level `env`.
- [ ] Không dùng secret trong command-line argument nếu tool hỗ trợ `STDIN` hoặc credential file.
- [ ] Shell tracing, verbose HTTP và dump environment bị tắt ở step đặc quyền.
- [ ] Third-party actions và reusable workflows được pin full commit SHA và review source.
- [ ] `secrets: inherit` có exception record, owner và review định kỳ; mặc định truyền từng secret tường minh.
- [ ] Fork PR và Dependabot không được “sửa” bằng cách cấp production secret.
- [ ] `pull_request_target` và `workflow_run` không checkout hoặc thực thi code không tin cậy trong privileged context.
- [ ] Self-hosted runner tách trust zone, ưu tiên ephemeral hoặc JIT và có egress allowlist.
- [ ] Secret phát sinh được `add-mask` trước mọi log và không truyền qua output giữa jobs.
- [ ] Secret scanning, push protection, custom patterns và alert routing đã bật theo plan.
- [ ] Push protection bypass được ủy quyền hẹp và đưa vào audit.
- [ ] Rotation có test, revoke credential cũ và hủy queued run sau thay đổi khẩn cấp.
- [ ] Incident runbook ưu tiên revoke trước xóa log hoặc rewrite Git history.
- [ ] Audit ghép GitHub, deployment, provider và network evidence.
- [ ] Happy path và negative path được diễn tập định kỳ.

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý an toàn |
|---|---|---|
| `${{ secrets.NAME }}` thành chuỗi rỗng | Sai tên; chưa tạo; organization policy không cấp repository; job dùng sai environment | Chạy `gh secret list` ở từng scope, kiểm tra environment thực tế và fail closed |
| Secret có trong Settings nhưng fork PR không nhận | GitHub cố ý không truyền stored secret cho fork | Giữ CI không đặc quyền; chuyển publish hoặc deploy sang post-merge và environment gate |
| Dependabot run thiếu token | Actions secrets không khả dụng cho event do Dependabot | Dùng Dependabot secret quyền đọc, OIDC được hỗ trợ hoặc bỏ qua step đặc quyền |
| Reusable workflow báo thiếu secret | Caller không truyền; contract sai tên; secret chỉ được truyền một cấp | Khai báo `on.workflow_call.secrets`, truyền explicit và truyền tiếp ở từng tầng |
| `secrets: inherit` vẫn không tới workflow C | Inherit chỉ tới workflow được gọi trực tiếp | B phải truyền explicit hoặc inherit tiếp sang C sau review |
| Called workflow dùng giá trị khác caller | Job trong called workflow khai báo environment và environment secret ghi đè | Kiểm tra environment trong called workflow và precedence; đổi contract hoặc tên để tránh shadowing |
| Environment nhận giá trị không mong đợi | Secret trùng tên ở environment, repository và organization | Đối chiếu `environment > repository > organization` và rotation record |
| Job chờ mãi trước deploy | Required reviewer, wait timer, custom rule, ref policy hoặc concurrency chưa đạt | Mở deployment protection status; xử lý đúng gate thay vì tắt protection |
| Actor không approve được | Prevent self-review đang hoạt động hoặc actor không phải reviewer hợp lệ | Dùng reviewer độc lập; không tắt rule chỉ để run tiếp |
| Tên environment lạ xuất hiện | Workflow gõ sai và GitHub tự tạo environment không rule | Dừng run, sửa YAML, xóa environment nhầm sau audit và bảo vệ workflow changes |
| Không dùng được secrets context trong if | `secrets.*` không khả dụng trực tiếp tại điều kiện | Ánh xạ vào job-level `env`, kiểm tra `env.NAME`, giữ job ngắn và tin cậy |
| Log hiện `***` | Runner đã redact chuỗi nhận diện được | Xóa lệnh in secret; audit artifact và network vì masking không chứng minh an toàn |
| Dạng Base64 hoặc URL-encoded bị lộ | Runner chỉ biết giá trị gốc hoặc mask đăng ký quá muộn | Revoke nếu đã lộ; tránh in; đăng ký từng dạng bằng `add-mask` trước khi dùng |
| Secret mới không có hiệu lực trong run cũ | Repository hoặc organization secret được đọc lúc run queued | Hủy run cũ và tạo run mới; revoke credential cũ ở provider |
| Organization secret không khả dụng | Policy sai, plan không hỗ trợ hoặc vượt 100 org secrets khả dụng | Chọn selected repositories, kiểm tra plan và giảm số secret dùng chung |
| `gh secret set` báo thiếu quyền org | CLI token thiếu `admin:org` hoặc user không phải owner phù hợp | `gh auth refresh -h github.com -s admin:org`, rồi xác minh role trước khi thử lại |
| Xóa GitHub secret nhưng token vẫn dùng được | Chưa revoke ở provider | Revoke credential nguồn và kiểm tra provider audit log |
| OIDC bị từ chối | Thiếu `id-token: write`; `aud`, `sub`, ref hoặc environment không khớp trust policy | Đối chiếu claims và policy; không nới wildcard để né lỗi |
| Secret scanning không phát hiện credential nội bộ | Không có pattern tương ứng, format bị biến đổi hoặc feature chưa bật | Thêm custom pattern, bật Secret Protection phù hợp và rotate credential nghi bị lộ |
| Push protection bị bypass | Contributor có quyền bypass hoặc exemption | Xem alert và audit reason, revoke nếu là secret thật, thu hẹp delegated bypass |
| Token xuất hiện trong artifact hoặc cache | Tool ghi workspace hay debug bundle trước upload | Revoke, xóa artifact/cache/run, sửa include path và thêm negative test |
| Self-hosted runner có dấu hiệu bất thường | Runner bền vững đã bị code không tin cậy chiếm | Cô lập và hủy runner, revoke mọi credential, dựng image sạch và điều tra egress |

## Tài liệu chính thức

Các nguồn dưới đây là GitHub Docs và GitHub CLI manual chính thức, được đối chiếu với nội dung hiện hành năm 2026:

- [About secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/about-secrets) — mô hình mã hóa, phạm vi và redaction.
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) — tạo, dùng, fork, Dependabot, CLI và dữ liệu lớn.
- [Secrets reference](https://docs.github.com/en/actions/reference/security/secrets) — naming, precedence, giới hạn và thời điểm đọc.
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) — least privilege, action pinning, runner hardening, injection và audit.
- [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#secrets-context) — phạm vi và khả dụng của `secrets` context.
- [Workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#masking-a-value-in-a-log) — `add-mask` và giới hạn theo job.
- [Reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#passing-inputs-and-secrets-to-a-reusable-workflow) — explicit secrets, `inherit`, nesting và environment caveat.
- [Workflow syntax for inherit](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecretsinherit) — điều kiện dùng `secrets: inherit`.
- [Dependabot on GitHub Actions](https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-on-actions#accessing-secrets) — privilege và Dependabot secrets.
- [Managing environments for deployment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) — approval, branch policy và thời điểm cấp environment secret.
- [OpenID Connect](https://docs.github.com/en/actions/concepts/security/openid-connect) — federation và token cloud ngắn hạn.
- [Configuring OpenID Connect in AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) — trust condition và workflow AWS chính thức.
- [GitHub App authentication in Actions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow) — installation token cho GitHub API.
- [GitHub CLI gh secret](https://cli.github.com/manual/gh_secret) — nhóm lệnh quản lý secret.
- [GitHub CLI gh secret set](https://cli.github.com/manual/gh_secret_set) — flags cho repository, environment và organization.
- [Secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning) — phạm vi quét, alert và khả dụng.
- [Push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection) — chặn push, bypass và delegated bypass.
- [Managing secret scanning alerts](https://docs.github.com/en/code-security/secret-scanning/managing-alerts-from-secret-scanning) — monitor, resolve và delegated dismissal.
- [Audit log events for an organization](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/audit-log-events-for-your-organization) — event names và fields hiện hành.
- [REST API for Actions secrets](https://docs.github.com/en/rest/actions/secrets) — automation quản lý secrets và public-key encryption.

## Các bài liên quan

<Cards>
  <Card
    title="Secrets trong GitHub Actions"
    href="/docs/nen-tang/10-secrets/"
    description="Nắm nền tảng secrets context, cách truyền giá trị và OIDC."
  />
  <Card
    title="GITHUB_TOKEN và permissions"
    href="/docs/bao-mat/01-github-token-permissions/"
    description="Thu hẹp quyền token mặc định theo từng job."
  />
  <Card
    title="OIDC federation"
    href="/docs/bao-mat/03-oidc-federation/"
    description="Thay cloud key dài hạn bằng workload identity và token ngắn hạn."
  />
  <Card
    title="Environments và approvals"
    href="/docs/cd/02-environments-approvals/"
    description="Thiết kế cổng staging và production với reviewer cùng protection rules."
  />
</Cards>
