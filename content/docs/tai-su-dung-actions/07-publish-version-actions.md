---
title: "Phát hành và quản lý phiên bản action"
description: "Chuẩn bị public action, phát hành theo Semantic Versioning, quản lý tag an toàn, đưa action lên GitHub Marketplace và bảo vệ chuỗi cung ứng."
---

<Callout type="info" title="Kết quả sau bài này">
  Bạn sẽ chuẩn bị một action đủ điều kiện công khai, phát hành `v1.2.3`, cập nhật tag major `v1` có kiểm soát, tạo GitHub Release và hướng dẫn consumer pin phiên bản an toàn. Bài viết cũng trình bày cách phối hợp moving tag với immutable releases, tự động hóa release bằng quyền tối thiểu, rollback và ngừng hỗ trợ một major version.
</Callout>

## Mục lục

- [Mô hình phân phối action](#mô-hình-phân-phối-action)
  - [Artifact thực sự được runner sử dụng](#artifact-thực-sự-được-runner-sử-dụng)
  - [Nhánh tag và commit SHA](#nhánh-tag-và-commit-sha)
- [Chuẩn bị repository công khai](#chuẩn-bị-repository-công-khai)
  - [Cấu trúc repository](#cấu-trúc-repository)
  - [README và giấy phép](#readme-và-giấy-phép)
  - [Metadata và branding](#metadata-và-branding)
  - [Sản phẩm dist của JavaScript action](#sản-phẩm-dist-của-javascript-action)
- [Thiết kế phiên bản](#thiết-kế-phiên-bản)
  - [Áp dụng Semantic Versioning](#áp-dụng-semantic-versioning)
  - [Chọn ref cho từng đối tượng](#chọn-ref-cho-từng-đối-tượng)
  - [Kết hợp tag major với immutable releases](#kết-hợp-tag-major-với-immutable-releases)
- [Quy trình release an toàn](#quy-trình-release-an-toàn)
  - [Cổng chất lượng trước release](#cổng-chất-lượng-trước-release)
  - [Tạo tag phiên bản chính xác](#tạo-tag-phiên-bản-chính-xác)
  - [Tạo GitHub Release](#tạo-github-release)
  - [Cập nhật tag major có kiểm soát](#cập-nhật-tag-major-có-kiểm-soát)
- [Tự động hóa release với quyền tối thiểu](#tự-động-hóa-release-với-quyền-tối-thiểu)
  - [Tách bước xác minh khỏi bước ghi](#tách-bước-xác-minh-khỏi-bước-ghi)
  - [Workflow release hoàn chỉnh](#workflow-release-hoàn-chỉnh)
  - [Cách vận hành workflow](#cách-vận-hành-workflow)
- [Đưa action lên GitHub Marketplace](#đưa-action-lên-github-marketplace)
  - [Điều kiện bắt buộc của Marketplace](#điều-kiện-bắt-buộc-của-marketplace)
  - [Quy trình publish trên giao diện](#quy-trình-publish-trên-giao-diện)
  - [Lưu ý sau khi publish](#lưu-ý-sau-khi-publish)
- [Bài thực hành end-to-end](#bài-thực-hành-end-to-end)
  - [Chuẩn bị bản v1.2.3](#chuẩn-bị-bản-v123)
  - [Phát hành và kiểm chứng](#phát-hành-và-kiểm-chứng)
  - [Kiểm thử từ repository consumer](#kiểm-thử-từ-repository-consumer)
  - [Checklist hoàn thành](#checklist-hoàn-thành)
- [Pinning và bảo vệ chuỗi cung ứng](#pinning-và-bảo-vệ-chuỗi-cung-ứng)
  - [Hướng dẫn pin cho consumer](#hướng-dẫn-pin-cho-consumer)
  - [Provenance và attestation](#provenance-và-attestation)
  - [Bảo vệ tài khoản và ref](#bảo-vệ-tài-khoản-và-ref)
- [Deprecation và migration](#deprecation-và-migration)
  - [Phát hành major mới](#phát-hành-major-mới)
  - [Ngừng hỗ trợ an toàn](#ngừng-hỗ-trợ-an-toàn)
- [Rollback khi release có lỗi](#rollback-khi-release-có-lỗi)
  - [Ưu tiên phát hành bản sửa lỗi mới](#ưu-tiên-phát-hành-bản-sửa-lỗi-mới)
  - [Rollback khẩn cấp tag major](#rollback-khẩn-cấp-tag-major)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Nguồn chính thức](#nguồn-chính-thức)
- [Tiếp tục trong series](#tiếp-tục-trong-series)

## Mô hình phân phối action

Một custom action không được cài từ package registry theo cách thư viện npm thường được cài. Workflow gọi action bằng cú pháp `OWNER/REPOSITORY@REF`. Runner phân giải `REF`, tải nội dung repository tại ref đó, đọc `action.yml` hoặc `action.yaml`, rồi thực thi entrypoint đã khai báo.

```text
Maintainer                         GitHub                         Consumer
    │                                │                               │
    ├─ test + build dist             │                               │
    ├─ push tag v1.2.3 ─────────────►│                               │
    ├─ publish GitHub Release ──────►│                               │
    ├─ cập nhật tag v1 có kiểm soát ►│                               │
    │                                │◄─ uses: OWNER/REPO@v1 ────────┤
    │                                ├─ trả repository tại ref ─────►│
    │                                │                               ├─ đọc action.yml
    │                                │                               └─ chạy dist/index.js
```

GitHub Release giúp công bố release notes, đánh dấu prerelease, gắn asset và xuất bản action lên Marketplace. Tuy nhiên, chính Git ref trong `uses:` mới quyết định mã nào chạy.

### Artifact thực sự được runner sử dụng

Với JavaScript action, `dist/index.js` đã commit trong repository là artifact thực thi. Runner không chạy `npm install` hay `npm run build` cho action của bạn. Vì vậy:

- `action.yml` phải trỏ `runs.main` đến file đã tồn tại trong commit phát hành;
- source, lockfile và `dist/` phải đồng bộ trong cùng commit;
- không chỉ tải bundle lên phần **Assets** của GitHub Release rồi bỏ `dist/` khỏi tag;
- mọi entrypoint `main`, `pre` và `post` đều phải được build và commit nếu metadata sử dụng chúng.

GitHub tự tạo source archive `.zip` và `.tar.gz` cho một Release. Workflow consumer cũng không tải các archive này; runner lấy repository theo ref.

### Nhánh tag và commit SHA

| Ref trong `uses` | Có thể thay đổi đích | Consumer tự nhận cập nhật | Trường hợp phù hợp |
|---|---:|---:|---|
| `@main` hoặc nhánh phát triển | Có | Có, kể cả breaking change | Thử nghiệm nội bộ; không nên ghi trong hướng dẫn production |
| `@release/v1` hoặc nhánh release | Có | Có | Kênh beta hoặc quy trình đặc thù đã công bố rõ |
| `@v1` | Có chủ đích | Patch và minor trong major 1 | Hướng dẫn sử dụng thuận tiện cho người tin maintainer |
| `@v1.2.3` | Thường không nên đổi; có thể được khóa bằng immutable release | Không | Đối chiếu release notes và tái hiện lỗi |
| `@<full-commit-SHA>` | Không | Không | Mức pin an toàn nhất cho consumer |

Theo secure use reference của GitHub, full-length commit SHA là cách pin bất biến được khuyến nghị cho action bên thứ ba. Tag chính xác dễ đọc hơn nhưng chỉ thực sự được GitHub khóa nếu nó gắn với một immutable release. Branch và moving tag luôn cần được xem là ref có thể dịch chuyển.

<Callout type="warn" title="Không hướng dẫn consumer dùng nhánh mặc định">
  `@main` không có biên giới release. Một commit chưa qua kiểm thử, thay đổi runtime hoặc interface mới có thể đi vào mọi workflow ngay sau khi merge.
</Callout>

## Chuẩn bị repository công khai

GitHub khuyến nghị đặt action dùng chung trong repository riêng. Cách này tách version của action khỏi ứng dụng, làm phạm vi review nhỏ hơn và cho phép GitHub Marketplace biểu diễn một action như một đơn vị phát hành.

### Cấu trúc repository

Một JavaScript action sẵn sàng phát hành có thể dùng cấu trúc sau:

<Files>
  <Folder name=".github" defaultOpen>
    <Folder name="workflows" defaultOpen>
      <File name="ci.yml" />
      <File name="release.yml" />
    </Folder>
    <File name="CODEOWNERS" />
  </Folder>
  <Folder name="dist" defaultOpen>
    <File name="index.js" />
    <File name="licenses.txt" />
  </Folder>
  <Folder name="src" defaultOpen>
    <File name="index.js" />
  </Folder>
  <Folder name="test" defaultOpen>
    <File name="index.test.js" />
  </Folder>
  <File name="action.yml" />
  <File name="CHANGELOG.md" />
  <File name="CONTRIBUTING.md" />
  <File name="LICENSE" />
  <File name="README.md" />
  <File name="SECURITY.md" />
  <File name="package-lock.json" />
  <File name="package.json" />
</Files>

Repository Marketplace chỉ nên chứa metadata, code và file cần thiết cho action. Các tài liệu cộng đồng như `README.md`, `LICENSE`, `CONTRIBUTING.md` và `SECURITY.md` vẫn thuộc phạm vi cần thiết. Không đưa credential, fixture nhạy cảm, file build tạm hay nhiều sản phẩm không liên quan vào repository này.

Trước khi đổi visibility thành public, hãy kiểm tra toàn bộ lịch sử Git chứ không chỉ working tree. Secret từng bị commit phải được thu hồi và xoay vòng, kể cả khi file hiện tại đã xóa giá trị đó.

### README và giấy phép

`README.md` là hợp đồng sử dụng dành cho con người. Tối thiểu nên có:

1. action làm gì và không làm gì;
2. runner, GitHub Enterprise Server và Node runtime được hỗ trợ;
3. bảng input, output, default và validation;
4. permission tối thiểu của `GITHUB_TOKEN`;
5. secret hoặc biến môi trường cần truyền;
6. ví dụ hoàn chỉnh dùng `@v1` và ví dụ pin full SHA;
7. changelog, lịch hỗ trợ major version và hướng dẫn migration;
8. kênh báo lỗi và quy trình báo lỗ hổng riêng tư;
9. trạng thái CI và giấy phép.

Ví dụ sử dụng trong README nên đủ quyền nhưng không rộng hơn nhu cầu:

```yaml
permissions:
  contents: read

steps:
  - name: Chạy PR Digest
    uses: acme/pr-digest-action@v1
    with:
      github-token: ${{ github.token }}
```

Đặt toàn văn giấy phép trong `LICENSE`, `LICENSE.txt` hoặc một tên chuẩn tại root. Repository public không tự động biến code thành phần mềm nguồn mở. Nếu không có giấy phép, luật bản quyền mặc định vẫn áp dụng và người khác không mặc nhiên có quyền sao chép, sửa hoặc phân phối. Hãy chọn giấy phép phù hợp với tổ chức và dependency; không sao chép một mẫu giấy phép khi chưa hiểu nghĩa vụ pháp lý.

Với JavaScript bundle, giữ thông báo giấy phép của dependency, chẳng hạn `dist/licenses.txt` do công cụ build tạo. Giấy phép của repository không thay thế giấy phép của dependency bắc cầu.

### Metadata và branding

Marketplace đọc thông tin từ metadata ở root. Ví dụ:

```yaml
name: PR Digest
description: Tóm tắt pull request trong GitHub Actions
author: Acme Engineering

inputs:
  github-token:
    description: Token dùng để đọc pull request
    required: true

outputs:
  summary:
    description: Nội dung tóm tắt pull request

runs:
  using: node24
  main: dist/index.js

branding:
  icon: file-text
  color: blue
```

`name`, `description` và `runs` là các trường cốt lõi. `branding` là tùy chọn nhưng giúp listing dễ nhận biết. `branding.icon` phải là icon Feather được metadata reference hỗ trợ; `branding.color` chỉ nhận một trong các màu GitHub cho phép. Không dùng tên thương hiệu, tên tính năng GitHub hay category Marketplace làm tên action nếu bạn không có quyền sử dụng.

Hãy giữ nguyên tên file metadata qua các release. GitHub cảnh báo rằng đổi từ `action.yml` sang `action.yaml`, hoặc ngược lại, sẽ làm các release Marketplace gắn với tên file cũ không còn hiển thị trên Marketplace. Các ref cũ vẫn có thể được gọi từ repository, nhưng lịch sử listing bị chia cắt.

### Sản phẩm dist của JavaScript action

Một cổng build tối thiểu nên tái tạo bundle từ lockfile:

```bash
npm ci
npm test
npm run build
node --check dist/index.js
git diff --exit-code -- dist/
git status --short
```

`git diff --exit-code -- dist/` phải thành công sau build. `git status --short` cũng phải rỗng; nếu có file untracked trong `dist/`, lệnh diff riêng không phát hiện được. CI nên kiểm tra cả hai điều kiện.

<Callout type="error" title="Không sửa dist bằng tay">
  Thay đổi chỉ xuất hiện trong `dist/` nhưng không có thay đổi tương ứng ở source hoặc lockfile là tín hiệu phải dừng release. Hãy sửa source, build lại bằng quy trình đã review, rồi kiểm tra bundle sinh ra.
</Callout>

## Thiết kế phiên bản

### Áp dụng Semantic Versioning

Semantic Versioning biểu diễn release bằng `MAJOR.MINOR.PATCH`. Action thường thêm tiền tố `v`, ví dụ `v1.2.3`.

| Thay đổi | Version kế tiếp từ `v1.2.3` | Ví dụ |
|---|---|---|
| Sửa lỗi tương thích ngược | `v1.2.4` | sửa parsing nhưng giữ input/output cũ |
| Tính năng tương thích ngược | `v1.3.0` | thêm input tùy chọn có default an toàn |
| Breaking change | `v2.0.0` | xóa input, đổi output hoặc thay hành vi mặc định |
| Bản thử nghiệm | `v2.0.0-rc.1` | cho consumer chủ động thử trước major mới |

Thay runtime cũng có thể là breaking change. Ví dụ, bỏ một runtime runner cũ hoặc ngừng hỗ trợ GHES đang được cam kết phải được đánh giá như thay đổi compatibility, không chỉ là việc bảo trì nội bộ.

SemVer chỉ hữu ích khi release notes và chính sách hỗ trợ khớp với nó. Một patch âm thầm đổi output hoặc permission là breaking change dù số version nói ngược lại.

### Chọn ref cho từng đối tượng

Một chính sách dễ hiểu là:

- **Tag release chính xác:** `v1.2.3`, luôn trỏ đến commit đã qua required checks.
- **Moving major tag:** `v1`, trỏ đến release ổn định mới nhất tương thích với major 1.
- **Moving minor tag tùy chọn:** `v1.2`, trỏ đến patch mới nhất của dòng 1.2. Chỉ duy trì nếu có consumer thật sự cần.
- **Release branch:** `release/v1`, dùng để chuẩn bị và backport. Không coi branch là release bất biến.
- **Commit SHA:** full 40 ký tự, được consumer bảo mật cao pin trực tiếp.

Không tạo tag `v1.2.3` từ một commit local chưa push hoặc chưa có CI. Không dùng lại tên version đã công bố cho mã khác. Nếu release hỏng, phát hành version mới.

### Kết hợp tag major với immutable releases

Immutable release khóa asset và Git tag gắn với release sau khi publish. GitHub hiện bảo vệ các thuộc tính sau:

- tag của release không thể di chuyển;
- tag không thể xóa khi release còn tồn tại;
- nếu xóa immutable release thì có thể xóa tag, nhưng không thể dùng lại cùng tên tag;
- release asset không thể sửa hoặc xóa;
- GitHub tự tạo release attestation chứa release tag, commit SHA và asset;
- sau khi publish, chỉ title và release notes còn có thể chỉnh sửa.

Tính bất biến chỉ áp dụng cho các release được tạo sau khi bật chính sách. Với asset cần tải lên, GitHub khuyên tạo draft, gắn đủ asset, rồi mới publish.

Để vừa có exact release bất biến vừa có `v1` di động:

1. Tạo GitHub Release cho tag chính xác `v1.2.3`. Tag này bị khóa khi immutable release được publish.
2. Tạo `v1` như một Git tag riêng và **không** tạo GitHub Release cho `v1`.
3. Khi `v1.3.0` ổn định, di chuyển tag `v1` đến commit mới bằng thao tác có review và compare-and-swap.

<Callout type="warn" title="Không tạo GitHub Release cho moving tag">
  Nếu repository bật immutable releases và bạn publish một Release gắn với `v1`, tag `v1` sẽ bị khóa. Khi đó không thể cập nhật `v1` sang bản tương thích mới. Chỉ exact tag như `v1.2.3` nên gắn với immutable Release.
</Callout>

## Quy trình release an toàn

### Cổng chất lượng trước release

Release phải bắt đầu từ commit đã được review trên protected branch hoặc release branch. Chạy cổng chất lượng trên clone sạch:

```bash
set -euo pipefail

VERSION=v1.2.3
TARGET_SHA="$(git rev-parse HEAD)"

[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]
[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]

git status --porcelain | grep -q . && {
  echo "Working tree không sạch" >&2
  exit 1
}

npm ci
npm test
npm run build
node --check dist/index.js
git diff --exit-code -- dist/

test -z "$(git status --porcelain)"
test -f action.yml
test -f README.md
test -f LICENSE
```

Regex trên chấp nhận prerelease để kiểm tra cú pháp chung. Với release ổn định cập nhật `v1`, hãy chỉ cho phép dạng `vX.Y.Z`; không tự động đưa release candidate vào moving major tag.

Ngoài test, reviewer phải đối chiếu:

- `action.yml` với README và source;
- version runtime với runner/GHES được hỗ trợ;
- source và lockfile với `dist/`;
- permission được ghi trong tài liệu;
- changelog và migration note;
- dependency license, vulnerability và provenance;
- commit đích đúng repository, đúng branch và đúng required checks.

### Tạo tag phiên bản chính xác

Nếu thao tác thủ công, tạo tag exact từ SHA đã xác minh:

```bash
VERSION=v1.2.3
TARGET_SHA=0123456789abcdef0123456789abcdef01234567

git fetch origin main --tags
git cat-file -e "${TARGET_SHA}^{commit}"
git merge-base --is-ancestor "$TARGET_SHA" origin/main

if git ls-remote --exit-code --tags origin "refs/tags/$VERSION" >/dev/null 2>&1; then
  echo "Tag $VERSION đã tồn tại; không ghi đè" >&2
  exit 1
fi

git tag -a "$VERSION" "$TARGET_SHA" -m "Release $VERSION"
git push origin "refs/tags/$VERSION"
```

Thay SHA ví dụ bằng full SHA thật. Nếu tổ chức ký tag bằng GPG hoặc SSH, dùng quy trình ký đã chuẩn hóa thay cho annotated tag thông thường. Dù dùng loại tag nào, không force-push exact version tag.

### Tạo GitHub Release

GitHub Release phải dùng exact tag vừa tạo:

```bash
gh release create v1.2.3 \
  --verify-tag \
  --title "v1.2.3" \
  --generate-notes
```

`--verify-tag` ngăn CLI âm thầm tạo tag ở một target khác. Release notes nên ghi:

- thay đổi nổi bật và sửa lỗi;
- breaking change, nếu có;
- input/output hoặc permission mới;
- runtime và nền tảng được hỗ trợ;
- full commit SHA;
- hướng dẫn nâng cấp và rollback;
- credit cho contributor và liên kết security advisory nếu release sửa lỗ hổng.

Nếu immutable releases đã bật và có release asset riêng, không publish ngay bằng lệnh trên. Tạo draft, tải đủ asset, xác minh checksum, rồi publish draft. Sau thời điểm publish, asset và tag sẽ bị khóa.

<Callout type="info" title="Release không thay thế tag">
  GitHub Release là lớp công bố trên một Git tag. Xóa hoặc chỉnh mô tả Release không phải là chiến lược rollback mã mà workflow consumer đang chạy.
</Callout>

### Cập nhật tag major có kiểm soát

Sau khi exact Release thành công và smoke test đạt, cập nhật `v1`. Không dùng `git push --force --tags`, vì lệnh đó có phạm vi rộng và có thể ghi đè nhiều tag ngoài dự kiến.

Quy trình an toàn đọc object ID hiện tại rồi dùng force-with-lease cho đúng một ref:

```bash
set -euo pipefail

MAJOR=v1
TARGET_SHA=0123456789abcdef0123456789abcdef01234567
OLD_REF="$(git ls-remote --refs origin "refs/tags/$MAJOR" | cut -f1)"

git fetch --no-tags origin "$TARGET_SHA"

if [[ -n "$OLD_REF" ]]; then
  git fetch --force --no-tags origin "refs/tags/$MAJOR:refs/tags/$MAJOR"
  OLD_COMMIT="$(git rev-parse "refs/tags/$MAJOR^{}")"

  git merge-base --is-ancestor "$OLD_COMMIT" "$TARGET_SHA" || {
    echo "Từ chối: release mới không đi tiếp từ $MAJOR hiện tại" >&2
    exit 1
  }

  git tag -f "$MAJOR" "$TARGET_SHA"
  git push \
    --force-with-lease="refs/tags/$MAJOR:$OLD_REF" \
    origin "refs/tags/$MAJOR"
else
  git tag "$MAJOR" "$TARGET_SHA"
  git push origin "refs/tags/$MAJOR"
fi
```

Lease làm push thất bại nếu người khác đã đổi `v1` sau lúc script đọc `OLD_REF`. Kiểm tra ancestry chặn thao tác vô tình đưa `v1` sang một lịch sử không liên quan hoặc lùi version. Rollback có chủ đích cần quy trình riêng với phê duyệt, được trình bày ở phần sau.

## Tự động hóa release với quyền tối thiểu

### Tách bước xác minh khỏi bước ghi

Một anti-pattern phổ biến là cấp `contents: write` cho job chạy `npm ci`, test và build. Lifecycle script của dependency khi đó cũng nhìn thấy token có quyền ghi. Workflow dưới đây chia thành hai job:

- `verify` chỉ có `contents: read`, checkout đúng SHA, chạy code và xác nhận `dist/` tái tạo được;
- `publish` chỉ chạy sau khi `verify` thành công, có `contents: write`, không checkout và không thực thi code dự án;
- environment `release` có thể yêu cầu reviewer phê duyệt trước khi job ghi bắt đầu;
- `concurrency` tránh hai lần phát hành cùng version chạy đồng thời.

`permissions: {}` ở cấp workflow thu hồi quyền mặc định. Mỗi job chỉ nhận quyền nó cần.

### Workflow release hoàn chỉnh

Tạo `.github/workflows/release.yml` trong repository action:

```yaml
name: Release action

on:
  workflow_dispatch:
    inputs:
      version:
        description: Exact stable version, ví dụ v1.2.3
        required: true
        type: string
      target_sha:
        description: Full 40-character SHA đã merge vào main
        required: true
        type: string

permissions: {}

concurrency:
  group: release-${{ inputs.version }}
  cancel-in-progress: false

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    outputs:
      version: ${{ steps.validate.outputs.version }}
      target_sha: ${{ steps.validate.outputs.target_sha }}
    steps:
      - name: Checkout exact candidate
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          ref: ${{ inputs.target_sha }}
          fetch-depth: 0
          persist-credentials: false

      - name: Validate version and target
        id: validate
        env:
          VERSION: ${{ inputs.version }}
          TARGET_SHA: ${{ inputs.target_sha }}
        shell: bash
        run: |
          set -euo pipefail

          [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
            echo "version phải có dạng vMAJOR.MINOR.PATCH" >&2
            exit 1
          }
          [[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || {
            echo "target_sha phải là full 40-character SHA chữ thường" >&2
            exit 1
          }
          test "$(git rev-parse HEAD)" = "$TARGET_SHA"

          git fetch origin main:refs/remotes/origin/main --no-tags
          git merge-base --is-ancestor "$TARGET_SHA" origin/main || {
            echo "target_sha chưa thuộc lịch sử main" >&2
            exit 1
          }

          REMOTE_EXACT="$(
            git ls-remote --refs origin "refs/tags/$VERSION" | cut -f1
          )"
          if [[ -n "$REMOTE_EXACT" && "$REMOTE_EXACT" != "$TARGET_SHA" ]]; then
            echo "$VERSION đã trỏ đến object khác; từ chối ghi đè" >&2
            exit 1
          fi

          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "target_sha=$TARGET_SHA" >> "$GITHUB_OUTPUT"

      - name: Test and rebuild distribution
        shell: bash
        run: |
          set -euo pipefail
          npm ci
          npm test
          npm run build
          node --check dist/index.js
          git diff --exit-code -- dist/
          test -z "$(git status --porcelain)"

  publish:
    needs: verify
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: release
    permissions:
      contents: write
    env:
      GH_TOKEN: ${{ github.token }}
      REPOSITORY: ${{ github.repository }}
      VERSION: ${{ needs.verify.outputs.version }}
      TARGET_SHA: ${{ needs.verify.outputs.target_sha }}
    steps:
      - name: Create exact tag and GitHub Release
        shell: bash
        run: |
          set -euo pipefail

          EXISTING="$(
            gh api "repos/$REPOSITORY/git/ref/tags/$VERSION" \
              --jq '.object.sha' 2>/dev/null || true
          )"

          if [[ -z "$EXISTING" ]]; then
            gh api --method POST "repos/$REPOSITORY/git/refs" \
              --field "ref=refs/tags/$VERSION" \
              --field "sha=$TARGET_SHA" >/dev/null
          elif [[ "$EXISTING" != "$TARGET_SHA" ]]; then
            echo "$VERSION đã tồn tại ở object khác; dừng release" >&2
            exit 1
          fi

          if ! gh release view "$VERSION" --repo "$REPOSITORY" >/dev/null 2>&1; then
            gh release create "$VERSION" \
              --repo "$REPOSITORY" \
              --verify-tag \
              --title "$VERSION" \
              --generate-notes
          fi

      - name: Advance moving major tag with a lease
        shell: bash
        run: |
          set -euo pipefail

          MAJOR="${VERSION%%.*}"
          WORKDIR="$(mktemp -d)"
          trap 'rm -rf "$WORKDIR"' EXIT

          gh auth setup-git
          git -C "$WORKDIR" init --quiet
          git -C "$WORKDIR" remote add origin \
            "https://github.com/$REPOSITORY.git"
          git -C "$WORKDIR" fetch --quiet --no-tags origin "$TARGET_SHA"

          OLD_REF="$(
            git -C "$WORKDIR" ls-remote --refs origin \
              "refs/tags/$MAJOR" | cut -f1
          )"

          if [[ "$OLD_REF" == "$TARGET_SHA" ]]; then
            echo "$MAJOR đã trỏ đến $TARGET_SHA"
            exit 0
          fi

          if [[ -n "$OLD_REF" ]]; then
            git -C "$WORKDIR" fetch --quiet --no-tags origin \
              "refs/tags/$MAJOR:refs/tags/$MAJOR"
            OLD_COMMIT="$(
              git -C "$WORKDIR" rev-parse "refs/tags/$MAJOR^{}"
            )"
            git -C "$WORKDIR" merge-base --is-ancestor \
              "$OLD_COMMIT" "$TARGET_SHA" || {
                echo "Từ chối cập nhật không fast-forward của $MAJOR" >&2
                exit 1
              }

            git -C "$WORKDIR" tag -f "$MAJOR" "$TARGET_SHA"
            git -C "$WORKDIR" push \
              --force-with-lease="refs/tags/$MAJOR:$OLD_REF" \
              origin "refs/tags/$MAJOR"
          else
            git -C "$WORKDIR" tag "$MAJOR" "$TARGET_SHA"
            git -C "$WORKDIR" push origin "refs/tags/$MAJOR"
          fi
```

Workflow cố ý chỉ nhận stable version `vX.Y.Z`; prerelease không được tự động cập nhật `vX`. Exact tag được tạo dạng lightweight để API có thể so sánh trực tiếp object SHA. Nếu repository của bạn bắt buộc signed annotated tag, hãy thay step tạo tag bằng hệ thống ký tập trung và giữ nguyên các cổng xác minh còn lại.

`actions/checkout` được pin full SHA và có chú thích major version để bot cập nhật có thể đề xuất SHA mới. Hãy xác minh SHA từ repository gốc trước khi chấp nhận một bản cập nhật.

### Cách vận hành workflow

1. Bảo vệ `main` bằng required review và required CI.
2. Tạo environment tên `release`; với gói GitHub phù hợp, cấu hình required reviewer.
3. Chỉ cho maintainer đáng tin cậy chạy workflow và phê duyệt environment.
4. Nhập version mới cùng full SHA đã merge.
5. Sau job, smoke test exact tag trước rồi mới thông báo rộng rãi.
6. Xem audit log, Release và hai ref `v1.2.3`, `v1`.

Workflow có thể chạy lại an toàn khi exact tag đã trỏ đúng SHA và Release đã tồn tại; nó tiếp tục kiểm tra moving major tag. Nếu exact tag trỏ object khác, workflow dừng thay vì ghi đè.

<Callout type="warn" title="Sự kiện tạo bởi GITHUB_TOKEN">
  Sự kiện do `GITHUB_TOKEN` tạo thường không khởi động một workflow mới, ngoại trừ các ngoại lệ được GitHub tài liệu hóa như `workflow_dispatch` và `repository_dispatch`. Đừng thiết kế chuỗi release với giả định rằng `gh release create` trong workflow này chắc chắn kích hoạt một workflow `on: release` khác. Hãy đặt các bước bắt buộc trong cùng quy trình được review hoặc kích hoạt tường minh.
</Callout>

## Đưa action lên GitHub Marketplace

Marketplace giúp người dùng khám phá action, nhưng không thay thế review bảo mật. GitHub cho biết action được publish ngay và không được GitHub review trước nếu đáp ứng điều kiện của Marketplace.

### Điều kiện bắt buộc của Marketplace

Theo tài liệu hiện hành, action phải đáp ứng các yêu cầu sau:

- nằm trong repository public;
- repository có một `action.yml` hoặc `action.yaml` ở root;
- `name` trong metadata là duy nhất trên Marketplace;
- tên không trùng user hoặc organization, trừ khi chính owner đó publish;
- tên không trùng category Marketplace;
- tên không dùng tên tính năng mà GitHub dành riêng;
- tài khoản hoặc organization owner đã chấp nhận GitHub Marketplace Developer Agreement;
- người publish chấp nhận điều khoản dịch vụ và có 2FA vì thao tác publish release yêu cầu 2FA.

Metadata file trong thư mục con có thể tồn tại, nhưng GitHub không tự động tạo listing Marketplace cho các action con đó. Nếu mục tiêu là một listing dễ hiểu, hãy giữ một action chính tại root và một repository cho một sản phẩm.

`README`, `LICENSE`, branding, CI và community health files không nằm trong danh sách điều kiện tên/metadata tối thiểu ở trên. Dù vậy, chúng là phần chuẩn bị cần thiết để người dùng đánh giá cách sử dụng, quyền, nguồn gốc và điều khoản phân phối.

### Quy trình publish trên giao diện

<Steps>
<Step>

Mở `action.yml` tại root trên GitHub. Banner Marketplace sẽ cung cấp nút **Draft a release** khi repository đủ điều kiện ban đầu.

</Step>
<Step>

Trong phần **Release Action**, chọn **Publish this Action to the GitHub Marketplace**. Nếu checkbox bị vô hiệu hóa, owner cần chấp nhận Marketplace Developer Agreement.

</Step>
<Step>

Sửa mọi lỗi hoặc cảnh báo metadata cho đến khi giao diện báo hợp lệ. Chọn primary category và, nếu hữu ích, một secondary category.

</Step>
<Step>

Chọn exact tag dạng `v1.2.3`, nhập title và release notes. Không chọn moving tag `v1` làm release Marketplace.

</Step>
<Step>

Nếu immutable releases được bật và có asset, lưu draft trước, tải đủ asset, kiểm tra lại rồi mới publish. Chọn **Publish release** và hoàn tất yêu cầu 2FA.

</Step>
</Steps>

Marketplace publishing hiện là luồng giao diện gắn với GitHub Release. Workflow tự động ở phần trước tạo Release thông thường; với release cần đánh dấu Marketplace, hãy lập kế hoạch thao tác giao diện được tài liệu chính thức hỗ trợ. Đặc biệt với lần publish đầu, bắt đầu từ banner của `action.yml` thay vì đoán một API Marketplace không được công bố.

### Lưu ý sau khi publish

- Listing dùng metadata từ repository; giữ README và ví dụ tương thích với major tag được quảng bá.
- Mỗi release Marketplace phải dùng exact semantic tag. Major tag chỉ là con trỏ thuận tiện cho workflow.
- Verified creator badge là tín hiệu xác minh tổ chức đối tác, không phải chứng nhận rằng code đã được GitHub audit.
- Khi transfer repository, GitHub tạo redirect từ URL cũ. Listing liên kết bằng `name` duy nhất, nhưng verified creator badge có thể mất nếu owner mới không phải verified creator.
- Muốn gỡ action khỏi Marketplace, tài liệu GitHub yêu cầu chỉnh từng release đã publish và bỏ chọn **Publish this action to the GitHub Marketplace**.
- Đổi tên metadata file giữa các release làm các version gắn với tên file cũ bị ẩn khỏi Marketplace.
- Không xóa repository để “reset” listing. Consumer, link, security advisory và lịch sử provenance đều bị ảnh hưởng.

## Bài thực hành end-to-end

Bài thực hành giả định repository `acme/pr-digest-action` đã có source, test, `action.yml` trỏ đến `dist/index.js`, và các npm script `test`, `build`.

### Chuẩn bị bản v1.2.3

<Steps>
<Step>

Đồng bộ `main`, tạo branch release và cập nhật changelog:

```bash
git switch main
git pull --ff-only origin main
git switch -c release/v1.2.3
```

Không đổi version chỉ để khớp kế hoạch nếu nội dung release chưa được chốt. Version phải phản ánh compatibility thực tế.

</Step>
<Step>

Build lại từ lockfile:

```bash
npm ci
npm test
npm run build
node --check dist/index.js
git diff --exit-code -- dist/
git status --short
```

Nếu source hoặc dependency đã đổi mà dist không đổi như kỳ vọng, kiểm tra entrypoint và script build. Nếu dist đổi, review và commit cùng source.

</Step>
<Step>

Mở pull request vào `main`. Yêu cầu review cho `action.yml`, source, lockfile, `dist/` và workflow release. Chờ mọi required check pass rồi merge.

</Step>
<Step>

Lấy full SHA trên `main` sau merge:

```bash
git fetch origin main
git rev-parse origin/main
```

Lưu đúng 40 ký tự; không dùng SHA rút gọn từ giao diện.

</Step>
</Steps>

### Phát hành và kiểm chứng

Chạy **Actions → Release action → Run workflow**, nhập `v1.2.3` và full SHA. Sau khi environment được phê duyệt, kiểm tra ref qua API:

```bash
REPO=acme/pr-digest-action
VERSION=v1.2.3
MAJOR=v1

gh api "repos/$REPO/git/ref/tags/$VERSION" --jq '.object.sha'
gh api "repos/$REPO/git/ref/tags/$MAJOR" --jq '.object.sha'
gh api "repos/$REPO/releases/tags/$VERSION" \
  --jq '{tag: .tag_name, immutable: .immutable, published: .published_at}'
```

Hai ref phải trả về SHA đã nhập. Release phải có tag `v1.2.3`; trường `immutable` là `true` nếu chính sách immutable release đã được bật trước khi tạo release.

Nếu release là immutable, xác minh release attestation:

```bash
gh release verify v1.2.3 --repo acme/pr-digest-action
```

`gh release verify-asset` chỉ dùng cho asset bạn tự gắn vào Release. GitHub nêu rõ lệnh này không xác minh source zip/tarball tự sinh, vì các archive đó chỉ được tạo khi có yêu cầu tải.

### Kiểm thử từ repository consumer

Tạo workflow smoke test trong một repository thử nghiệm:

```yaml
name: Smoke test released action

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Run exact release
        uses: acme/pr-digest-action@v1.2.3
        with:
          github-token: ${{ github.token }}

      - name: Run moving major
        uses: acme/pr-digest-action@v1
        with:
          github-token: ${{ github.token }}
```

Khi cả hai step chạy cùng code và tạo kết quả mong đợi, thay một step bằng full SHA để kiểm tra hướng dẫn bảo mật:

```yaml
- name: Run immutable commit
  uses: acme/pr-digest-action@0123456789abcdef0123456789abcdef01234567 # v1.2.3
  with:
    github-token: ${{ github.token }}
```

Thay SHA ví dụ bằng SHA release thật. Comment version giúp reviewer hiểu SHA thuộc release nào, nhưng SHA mới là ref được runner dùng.

### Checklist hoàn thành

- [ ] Repository public không còn secret trong working tree hoặc lịch sử có thể truy cập.
- [ ] `README.md`, `LICENSE`, `SECURITY.md` và metadata đã được review.
- [ ] Metadata ở root, tên action phù hợp và branding dùng giá trị được hỗ trợ.
- [ ] Input, output, permission và ví dụ README khớp implementation.
- [ ] `npm ci`, test và build thành công từ clone sạch.
- [ ] `dist/` được commit và tái tạo không tạo diff hoặc file untracked.
- [ ] Exact tag `v1.2.3` trỏ đúng full SHA đã qua required checks.
- [ ] GitHub Release gắn với `v1.2.3`, không gắn với `v1`.
- [ ] Moving tag `v1` trỏ cùng SHA sau smoke test.
- [ ] Consumer test chạy được bằng exact tag, major tag và full SHA.
- [ ] Release notes có thay đổi, compatibility, permission, SHA và migration note.
- [ ] Nếu publish Marketplace, giao diện xác nhận metadata hợp lệ và listing hiển thị đúng.

## Pinning và bảo vệ chuỗi cung ứng

### Hướng dẫn pin cho consumer

Maintainer nên mô tả rõ ba lựa chọn thay vì tuyên bố một ref phù hợp cho mọi người:

```yaml
- uses: acme/pr-digest-action@v1 # tự nhận patch/minor tương thích

- uses: acme/pr-digest-action@v1.2.3 # version dễ đọc

- uses: acme/pr-digest-action@0123456789abcdef0123456789abcdef01234567 # an toàn nhất, v1.2.3
```

Consumer pin SHA phải:

1. dùng full-length SHA, không dùng SHA rút gọn;
2. xác minh commit thuộc repository gốc, không phải fork có tên giống;
3. đối chiếu SHA với exact release và release notes;
4. dùng Dependabot để nhận pull request cập nhật GitHub Actions;
5. review diff từ SHA cũ đến SHA mới trước khi merge;
6. áp dụng policy yêu cầu full SHA ở repository hoặc organization nếu mức rủi ro đòi hỏi.

Pin SHA ngăn cập nhật ngoài ý muốn nhưng cũng ngăn consumer tự nhận security patch. Vì vậy, pinning phải đi cùng bot cập nhật và SLA review, không phải pin một lần rồi bỏ quên.

### Provenance và attestation

Chuỗi bằng chứng tối thiểu cho một action gồm:

```text
Pull request đã review
        │
        ▼
Commit SHA trên protected main
        │
        ├── exact tag v1.2.3
        ├── source + lockfile + dist đồng bộ
        ├── GitHub Release + release notes
        └── immutable release attestation nếu đã bật
```

Immutable release tự tạo release attestation cho tag, commit SHA và release asset. Consumer có thể dùng `gh release verify`. Đây là bằng chứng hữu ích, nhưng không thay thế pin full SHA trong workflow.

Nếu phát hành binary, SBOM hoặc bundle archive như một asset riêng, có thể tạo artifact attestation trong job build. Quyền bổ sung phải được cấp đúng job:

```yaml
permissions:
  contents: read
  id-token: write
  attestations: write

steps:
  - name: Attest release archive
    uses: actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4
    with:
      subject-path: release/pr-digest-action-v1.2.3.tgz
```

Consumer xác minh artifact bằng `gh attestation verify PATH -R OWNER/REPO`. Chỉ attest file thật sự phân phối; attestation của một archive phụ không chứng minh rằng `dist/index.js` trong tag giống archive nếu quy trình không so sánh hai nội dung.

### Bảo vệ tài khoản và ref

- Bật 2FA và ưu tiên passkey hoặc hardware security key cho maintainer.
- Giới hạn quyền admin/write; dùng team thay vì token cá nhân chia sẻ.
- Bảo vệ `main`, release environment và tag pattern bằng ruleset phù hợp.
- Dùng `CODEOWNERS` cho `action.yml`, `dist/`, lockfile và `.github/workflows/`.
- Pin action bên thứ ba trong chính CI/release workflow bằng full SHA.
- Dùng `GITHUB_TOKEN` ngắn hạn và quyền tối thiểu; tránh PAT dài hạn nếu không bắt buộc.
- Theo dõi audit log cho thay đổi ruleset, release, tag và workflow.
- Bật dependency graph, Dependabot, code scanning và secret scanning phù hợp với gói GitHub.
- Không chạy code pull request không tin cậy trong job có secret hoặc quyền ghi.

## Deprecation và migration

### Phát hành major mới

Khi có breaking change, không di chuyển `v1` đến code của `v2`. Duy trì hai dòng độc lập:

```text
v1 ──► v1.9.4 ──► commit ổn định cuối của major 1
v2 ──► v2.0.0 ──► v2.1.0
```

Quy trình migration nên gồm:

1. phát hành prerelease `v2.0.0-rc.1` để consumer thử bằng exact tag;
2. ghi bảng before/after cho input, output, permission và hành vi;
3. phát hành `v2.0.0`, sau đó tạo moving tag `v2`;
4. cập nhật README để ví dụ mặc định dùng `@v2`, nhưng giữ tài liệu `v1`;
5. cung cấp thời hạn hỗ trợ `v1` và loại update còn được nhận;
6. nếu có thể, phát hành patch `v1` thêm cảnh báo deprecation mà không làm workflow thất bại.

Metadata hỗ trợ `inputs.<input_id>.deprecationMessage`. Khi consumer còn truyền input cũ, runner ghi cảnh báo. Đây là cách tốt để dẫn người dùng sang input mới trước khi xóa ở major tiếp theo:

```yaml
inputs:
  old-format:
    description: Định dạng cũ
    required: false
    deprecationMessage: >-
      old-format sẽ bị xóa trong v2; hãy dùng output-format.
```

### Ngừng hỗ trợ an toàn

- Công bố ngày deprecation và end-of-support trong README, release notes và Discussion/issue ghim.
- Giữ exact tag và `v1` hiện hữu; không tái sử dụng chúng cho code khác.
- Trong thời gian cam kết, phát hành security patch tương thích cho major cũ nếu chính sách yêu cầu.
- Sau end-of-support, cập nhật README và release notes để nói rõ trạng thái. Không cố tình làm action cũ thất bại chỉ để ép migration.
- Nếu lỗ hổng ảnh hưởng consumer, dùng repository security advisory và nêu version đã sửa.
- Nếu gỡ khỏi Marketplace, thực hiện theo từng release như tài liệu Marketplace hướng dẫn. Gỡ listing không tự sửa workflow đang gọi repository ref.
- Archive repository chỉ khi đã đánh giá tác động đến issue, advisory, Dependabot và người dùng hiện tại.

## Rollback khi release có lỗi

### Ưu tiên phát hành bản sửa lỗi mới

Giả sử `v1.2.3` có lỗi. Cách khắc phục ưu tiên là:

1. dừng truyền thông và đánh dấu release notes bằng cảnh báo rõ ràng;
2. không xóa hoặc di chuyển `v1.2.3`;
3. sửa lỗi trên branch được review;
4. phát hành `v1.2.4` từ commit mới;
5. smoke test `v1.2.4`;
6. cập nhật `v1` từ SHA lỗi sang SHA của `v1.2.4` bằng lease;
7. mở security advisory nếu lỗi là lỗ hổng.

Với immutable release, maintainer vẫn có thể sửa title và release notes để cảnh báo, nhưng không thể thay asset hay tag. Đây là hành vi đúng: cùng tên version luôn biểu diễn cùng nội dung.

Consumer pin `v1.2.3` hoặc SHA cũ không tự nhận bản sửa. Hãy công bố SHA mới và tạo pull request cập nhật ở các repository quan trọng.

### Rollback khẩn cấp tag major

Nếu `v1` vừa được đưa đến release lỗi và chưa thể phát hành patch, có thể tạm đưa `v1` về last-known-good. Đây là ngoại lệ cần incident record và phê duyệt release environment.

Đọc ref xấu hiện tại và dùng nó làm lease:

```bash
set -euo pipefail

MAJOR=v1
KNOWN_BAD_REF="$(git ls-remote --refs origin "refs/tags/$MAJOR" | cut -f1)"
GOOD_SHA=fedcba9876543210fedcba9876543210fedcba98

test -n "$KNOWN_BAD_REF"
git fetch --no-tags origin "$GOOD_SHA"
git tag -f "$MAJOR" "$GOOD_SHA"
git push \
  --force-with-lease="refs/tags/$MAJOR:$KNOWN_BAD_REF" \
  origin "refs/tags/$MAJOR"
```

Trước khi chạy, xác minh `GOOD_SHA` đúng là commit của exact release ổn định trước đó. Lease bảo đảm rollback không ghi đè thay đổi đồng thời. Sau rollback, phát hành patch mới càng sớm càng tốt; moving tag lùi chỉ là biện pháp giảm thiểu tạm thời.

Không rollback bằng `git push --force --tags`, xóa Release, sửa asset tại chỗ hoặc dùng lại tên `v1.2.3`. Với immutable releases, xóa release rồi xóa tag vẫn không cho phép tái sử dụng tên tag đó.

## Best practices

- **Một repository cho một action chính:** version, Marketplace listing và phạm vi review dễ hiểu hơn.
- **Exact release trước, moving tag sau:** luôn có điểm khôi phục và release notes trước khi consumer `@v1` nhận mã mới.
- **Không force-push exact tag:** version đã công bố phải biểu diễn một nội dung duy nhất.
- **Di chuyển major tag bằng lease:** chỉ cập nhật một ref và thất bại khi trạng thái remote đã đổi.
- **Pin action của release workflow bằng full SHA:** release pipeline cũng là một phần của chuỗi cung ứng.
- **Tách job read và write:** không cho build script hoặc dependency lifecycle script nhìn thấy token ghi.
- **Commit dist cùng source:** JavaScript action phải chạy được ngay từ ref, không phụ thuộc release asset.
- **Dùng lockfile và build tái lập:** `npm ci`, test, build và diff dist là cổng bắt buộc.
- **Bật immutable releases cho exact tag:** khóa tag, asset và tạo release attestation; không tạo Release cho `v1`.
- **Ghi full SHA trong release notes:** consumer có thể đối chiếu và pin mà không đoán.
- **Tài liệu hóa permission tối thiểu:** ví dụ README không dùng `write-all` cho action chỉ đọc.
- **Dùng environment approval:** thao tác publish là thay đổi production, không chỉ là một job CI khác.
- **Duy trì migration path:** major cũ không được âm thầm đổi thành major mới.
- **Ưu tiên release sửa lỗi thay vì viết lại lịch sử:** audit trail rõ ràng giúp cả maintainer lẫn consumer.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Không thấy banner publish Marketplace | Repository chưa public, metadata không ở root hoặc metadata không hợp lệ. | Đặt một `action.yml`/`action.yaml` ở root, kiểm tra `name`, `description`, `runs`, rồi tải lại trang file trên GitHub. |
| Checkbox Marketplace bị vô hiệu hóa | Owner chưa chấp nhận Marketplace Developer Agreement. | User owner hoặc organization owner mở liên kết trong phần Release Action và chấp nhận thỏa thuận. |
| Publish Release yêu cầu xác thực bổ sung | Marketplace publishing yêu cầu 2FA. | Bật và hoàn tất 2FA cho tài khoản publish; không tìm cách né bằng token dùng chung. |
| Tên action bị từ chối | Tên đã tồn tại, trùng user/org/category hoặc thuộc tên GitHub dành riêng. | Chọn tên metadata khác, cụ thể và duy nhất; không chỉ đổi tên repository. |
| Release cũ biến mất khỏi Marketplace sau khi đổi metadata | Đổi `action.yml` thành `action.yaml` hoặc ngược lại. | Khôi phục tên file ổn định; xem metadata filename như một phần compatibility của listing. |
| `Cannot find dist/index.js` | Dist không tồn tại trong tag hoặc `runs.main` sai. | Checkout exact tag, build và commit dist ở release mới; không sửa tag cũ. |
| Source đã đổi nhưng action vẫn chạy hành vi cũ | Dist chưa được build lại trước khi tag. | Chạy build-check, review diff dist và phát hành patch mới. |
| Workflow release báo working tree không sạch | Build sinh diff hoặc file untracked. | Chạy cùng Node/npm và lockfile như CI, review output, commit artifact cần thiết hoặc sửa build không xác định. |
| `Resource not accessible by integration` khi tạo tag/Release | Job thiếu `contents: write`, policy chặn hoặc environment chưa được phê duyệt. | Cấp `contents: write` chỉ cho job publish, kiểm tra ruleset và trạng thái environment. |
| Release automation không kích hoạt workflow `on: release` kế tiếp | Release được tạo bằng `GITHUB_TOKEN`, nên cơ chế chống lặp không sinh workflow run như mong đợi. | Đặt bước bắt buộc trong cùng workflow hoặc kích hoạt tường minh bằng event được hỗ trợ và token phù hợp. |
| Không thể di chuyển `v1` | `v1` đã gắn với immutable Release hoặc ruleset cấm update tag. | Không tạo Release cho moving tag; dùng exact release tag cho immutable Release. Điều chỉnh ruleset có kiểm soát nếu chính sách cho phép moving major. |
| `force-with-lease` bị reject | Một maintainer hoặc workflow khác đã đổi tag sau khi script đọc ref. | Fetch lại, xác minh SHA mới và release notes; chạy lại thay vì đổi sang force mù. |
| Workflow từ chối cập nhật không fast-forward | Target không đi tiếp từ commit `v1` hiện tại hoặc nhập nhầm SHA. | Xác minh release branch và SHA. Với rollback thật sự, dùng quy trình rollback có phê duyệt riêng. |
| Exact tag đã tồn tại ở SHA khác | Version bị dùng trước đó hoặc nhập nhầm version. | Không ghi đè. Chọn version mới sau khi điều tra lịch sử và audit log. |
| Immutable release không khóa release cũ | Chính sách chỉ áp dụng cho release tạo sau khi bật. | Không giả định hồi tố; pin SHA cho release cũ và dùng immutable release cho các version mới. |
| Không thể tải thêm asset vào immutable release | Release đã publish nên asset bị khóa. | Phát hành version mới. Lần sau tạo draft, gắn đủ asset rồi mới publish. |
| `gh release verify-asset` không xác minh source archive | Source zip/tarball do GitHub tạo theo yêu cầu tải, không phải asset đã gắn. | Xác minh immutable Release bằng `gh release verify`; dùng `verify-asset` cho asset do bạn tải lên. |
| Consumer pin SHA không nhận security patch | SHA cố ý bất biến. | Dùng Dependabot hoặc bot tương đương để mở PR cập nhật SHA, rồi review diff trước khi merge. |
| Gỡ Marketplace nhưng workflow vẫn chạy action | Gỡ listing chỉ ảnh hưởng khả năng khám phá, không xóa ref repository. | Công bố deprecation, migration và xử lý repository/ref theo kế hoạch riêng; không coi unlisting là kill switch. |

## Nguồn chính thức

- [Releasing and maintaining actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/release-and-maintain-actions)
- [Managing custom actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)
- [Publishing actions in GitHub Marketplace](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace)
- [Metadata syntax reference](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)
- [Managing releases in a repository](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
- [About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
- [Using immutable releases and tags to manage action releases](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/using-immutable-releases-and-tags-to-manage-your-actions-releases)
- [Preventing changes to releases](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes)
- [Verifying the integrity of a release](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Using artifact attestations to establish provenance](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
- [About README files](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [Semantic Versioning 2.0.0](https://semver.org/)

## Tiếp tục trong series

<Cards>
  <Card title="JavaScript actions" href="/docs/tai-su-dung-actions/04-javascript-actions/" description="Xây dựng, kiểm thử và bundle JavaScript action trước khi phát hành." />
  <Card title="Docker container actions" href="/docs/tai-su-dung-actions/05-docker-container-actions/" description="Đóng gói action và runtime bằng Docker container." />
  <Card title="Action metadata" href="/docs/tai-su-dung-actions/06-action-metadata/" description="Khai báo input, output, runs và branding trong action.yml." />
</Cards>
