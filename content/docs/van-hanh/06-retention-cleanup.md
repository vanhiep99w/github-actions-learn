---
title: "Retention và cleanup"
description: "Cách đặt retention cho run, log, artifact và cache trong GitHub Actions, và cách dọn dẹp an toàn."
---

<Callout type="info" title="Phạm vi">
  Tài liệu này tập trung vào dữ liệu tạm thời của GitHub Actions. Nếu một file là bằng chứng kiểm toán, biên bản sự cố, hoặc dữ liệu pháp lý, hãy gắn nhãn và luồng lưu trữ riêng để job cleanup tự động không xóa nhầm.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
  - [Retention là gì](#retention-là-gì)
  - [Ba nhóm dữ liệu cần phân biệt](#ba-nhóm-dữ-liệu-cần-phân-biệt)
- [Bảng quyết định retention](#bảng-quyết-định-retention)
  - [Quy tắc chọn số ngày](#quy-tắc-chọn-số-ngày)
- [Cấu hình retention trong workflow](#cấu-hình-retention-trong-workflow)
  - [`upload-artifact` với `retention-days`](#upload-artifact-với-retention-days)
  - [Giới hạn theo repo, org và enterprise](#giới-hạn-theo-repo-org-và-enterprise)
- [Vòng đời cache](#vòng-đời-cache)
  - [Cache được tạo và bị thu hồi thế nào](#cache-được-tạo-và-bị-thu-hồi-thế-nào)
  - [Điều không nên làm với cache](#điều-không-nên-làm-với-cache)
- [Cleanup thủ công](#cleanup-thủ-công)
  - [Xóa trong UI](#xóa-trong-ui)
  - [Xóa bằng `gh`](#xóa-bằng-gh)
  - [Xóa bằng REST API](#xóa-bằng-rest-api)
- [Cleanup tự động an toàn](#cleanup-tự-động-an-toàn)
  - [Workflow định kỳ có dry-run](#workflow-định-kỳ-có-dry-run)
  - [Chọn phạm vi giữ lại](#chọn-phạm-vi-giữ-lại)
  - [Dán workflow có dry-run](#dán-workflow-có-dry-run)
  - [Chạy thử và xác minh](#chạy-thử-và-xác-minh)
  - [Idempotency và phạm vi xóa](#idempotency-và-phạm-vi-xóa)
  - [Không xóa evidence audit](#không-xóa-evidence-audit)
- [Quyền và policy](#quyền-và-policy)
  - [Quyền tối thiểu](#quyền-tối-thiểu)
  - [Thiết lập policy ở repo và org](#thiết-lập-policy-ở-repo-và-org)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Tổng quan

Retention là khoảng thời gian dữ liệu được phép tồn tại trước khi GitHub hoặc quy trình của bạn xóa nó. Trong GitHub Actions, ba vòng đời thường bị nhầm lẫn là workflow run logs, artifacts và cache. Chúng không giống nhau.

### Retention là gì

Workflow run logs là nhật ký của một lần chạy workflow. Artifacts là file đầu ra bạn chủ động upload để tải về sau. Cache là bộ đệm phụ thuộc dùng để tăng tốc lần chạy tiếp theo.

Mức giữ lại thực tế luôn là giá trị nhỏ nhất trong các giới hạn liên quan: giá trị bạn yêu cầu, giới hạn của repo, giới hạn của organization, và giới hạn của enterprise. Với cache thì logic khác: cache không có `retention-days`, mà được GitHub quản lý theo vòng đời riêng.

### Ba nhóm dữ liệu cần phân biệt

- **Logs**: dùng để điều tra, đọc lại từng bước, và đối chiếu sự cố. Đây là thứ bạn thường muốn giữ ngắn hơn artifact dài hạn nhưng lâu hơn cache.
- **Artifacts**: dùng để truyền dữ liệu giữa jobs hoặc giữ đầu ra ngắn hạn như report test, coverage, bundle build.
- **Cache**: dùng để tăng tốc restore dependency. Cache phải coi là dữ liệu dùng xong là bỏ.
- **Evidence/audit**: không phải dữ liệu CI tạm thời. Nếu cần giữ lâu, hãy tách khỏi pipeline cleanup thông thường.

<Callout type="warn" title="Đừng trộn cache với bằng chứng">
  Cache có thể được phục hồi bởi người có quyền đọc repository. Không lưu secret, token, audit log, hoặc file cần bất biến vào cache.
</Callout>

## Bảng quyết định retention

Dùng bảng này để chọn số ngày hợp lý trước khi bạn cấu hình workflow hoặc policy cấp cao hơn.

| Loại dữ liệu | Khuyến nghị mặc định | Khi nào tăng thời gian giữ | Cách dọn phù hợp | Ghi chú |
|---|---:|---|---|---|
| Workflow run logs | 30–90 ngày | Cần điều tra sự cố, cần đối chiếu thay đổi nhiều ngày, hoặc có yêu cầu audit | Xóa workflow run trong UI hoặc bằng `gh run delete` | Không nên giữ vô thời hạn cho mọi repo |
| Artifacts build/test | 7–30 ngày | Cần tái tạo bug, cần tải lại gói build, hoặc cần review report lâu hơn | Xóa artifact riêng lẻ bằng UI hoặc API | Chỉ dùng cho dữ liệu tạm thời |
| Artifacts phát hành/evidence | 90–365 ngày, hoặc chuyển sang kho lưu trữ dài hạn | Có yêu cầu pháp lý, kiểm toán, hoặc release cần truy hồi | Không dọn bằng job chung; tách luồng lưu trữ | Nên dùng release asset hoặc storage riêng |
| Cache dependency | Không đặt `retention-days` | Không áp dụng; cache đã là dữ liệu có thể bị thu hồi tự động | Để GitHub evict tự động | Cache không phải nơi lưu chứng cứ |
| Evidence/audit | Theo policy tuân thủ | Thường phải giữ lâu hơn CI bình thường | Loại khỏi cleanup tự động | Nên gắn prefix riêng hoặc tách repo/storage |

### Quy tắc chọn số ngày

1. Chọn số ngày ngắn nhất vẫn đủ cho nhu cầu debug và audit.
2. Nếu artifact chỉ phục vụ chuyển dữ liệu giữa jobs trong cùng workflow, hãy giữ rất ngắn. 7 đến 14 ngày thường đủ.
3. Nếu artifact là báo cáo test hoặc coverage cần quay lại xem sau khi merge, 14 đến 30 ngày là mức an toàn hơn.
4. Nếu dữ liệu cần bằng chứng tuân thủ, đừng để nó nằm chung luồng với artifact tạm thời.
5. Cache không nên được dùng để thay thế kho lưu trữ dài hạn. Cứ để GitHub quản lý vòng đời cache.

## Cấu hình retention trong workflow

### `upload-artifact` với `retention-days`

`retention-days` áp dụng trên từng artifact. Đây là cách giảm thời gian giữ cho file đầu ra ngắn hạn mà không chạm vào policy mặc định của repo.

```yaml
- name: Upload test report
  uses: actions/upload-artifact@v4
  with:
    name: test-report
    path: reports/test-report.html
    retention-days: 14
```

<Callout type="info" title="Điểm cần nhớ">
  `retention-days` chỉ có tác dụng nếu giá trị đó không vượt qua giới hạn của repository, organization, hoặc enterprise. Nếu policy cấp trên thấp hơn, GitHub sẽ áp dụng mức thấp hơn.
</Callout>

### Giới hạn theo repo, org và enterprise

Hãy xem retention như một chuỗi giới hạn xếp chồng. Repo có thể cấu hình một mức mặc định, organization có thể siết chặt hơn, và enterprise có thể siết tiếp. Người viết workflow không được vượt qua mức cap này bằng `retention-days`.

Tóm lại:

- Nếu bạn cần giữ lâu hơn, tăng policy ở cấp quản trị trước.
- Nếu bạn chỉ cần giữ ngắn hơn, cấu hình ngay trong workflow bằng `retention-days`.
- Nếu dữ liệu là evidence, đừng cố kéo dài artifact tạm thời đến mức “gần như vĩnh viễn”. Hãy chuyển nó sang nơi lưu trữ phù hợp.

<Callout type="warn" title="Artifact không phải kho lưu trữ lâu dài">
  Workflow artifact là dữ liệu có hạn sử dụng. Nếu file đó phải tồn tại qua nhiều tháng hoặc nhiều năm, hãy chuyển sang release asset, object storage, hoặc kho lưu trữ được thiết kế cho retention dài hạn.
</Callout>

## Vòng đời cache

### Cache được tạo và bị thu hồi thế nào

Cache của GitHub Actions hoạt động theo key. Khi `key` khớp chính xác, bạn có cache hit. Khi không khớp, GitHub tìm theo prefix và `restore-keys`, rồi tạo cache mới nếu job chạy thành công.

Bạn không thể sửa nội dung của một cache đã tồn tại. Muốn đổi nội dung, hãy tạo cache mới với key mới.

```yaml
- name: Cache npm
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-npm-
      ${{ runner.os }}-
```

Cache không có `retention-days`. Khi cache không còn được truy cập, GitHub sẽ dần thu hồi nó theo chính sách của nền tảng.

### Điều không nên làm với cache

<Callout type="warn" title="Cache chỉ dành cho dependency tạm thời">
  Đừng đưa secret, token, build evidence, hoặc log kiểm toán vào cache. Người có quyền đọc repository có thể phục hồi cache, nên cache phải được xem là dữ liệu nhạy cảm chỉ ở mức tối thiểu cần thiết.
</Callout>

- Không dùng cache để giữ file cần bất biến.
- Không dùng cache để lưu output có giá trị pháp lý.
- Không dùng cache làm nơi “trốn” artifact khỏi policy retention.
- Không kỳ vọng cache thay thế release asset hoặc long-term storage.

## Cleanup thủ công

### Xóa trong UI

- Mở repository trên GitHub.
- Vào **Actions** và mở workflow run cần kiểm tra.
- Nếu mục tiêu là log của run, xóa workflow run đó từ UI khi quyền của bạn cho phép.
- Nếu mục tiêu là artifact, mở phần artifacts của run và xóa đúng artifact cần dọn.
- Luôn kiểm tra tên artifact trước khi bấm xóa. Với repo có evidence, chỉ xóa những item không thuộc luồng audit.

### Xóa bằng `gh`

GitHub CLI có lệnh chính thức để xóa workflow run:

```bash
gh run delete 12345 -R OWNER/REPO
```

Nếu bạn không nhớ ID, có thể gọi lệnh mà không truyền run ID để chọn tương tác:

```bash
gh run delete -R OWNER/REPO
```

Dùng `gh` khi bạn cần xóa một run cụ thể và muốn thao tác nhanh từ terminal. Với artifact, gh CLI thường được dùng cùng `gh api` hoặc với API REST bên dưới.

### Xóa bằng REST API

Để xóa artifact, dùng REST API chính thức của GitHub Actions artifacts. Endpoint này yêu cầu quyền **Actions: write** trên repository.

```bash
curl -L \
  -X DELETE \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  https://api.github.com/repos/OWNER/REPO/actions/artifacts/ARTIFACT_ID
```

Khi xóa thành công, API trả về `204 No Content`.

Trước khi xóa hàng loạt, hãy liệt kê trước:

- `GET /repos/{owner}/{repo}/actions/artifacts`
- `GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts`

Danh sách này giúp bạn lọc theo tên, thời gian tạo, hoặc workflow run trước khi thực hiện delete.

## Cleanup tự động an toàn

### Workflow định kỳ có dry-run

<Steps>
<Step>

### Chọn phạm vi giữ lại

Quy tắc an toàn nên là “xóa artifact tạm thời, giữ evidence”. Hãy xác định rõ:

- prefix nào được phép xóa,
- prefix nào phải giữ,
- số ngày nào là ngưỡng xóa,
- artifact nào phải loại trừ khỏi cleanup.

Một cách đơn giản là dùng prefix `evidence-` và `audit-` cho dữ liệu cần giữ, rồi cho job cleanup bỏ qua các prefix đó.

</Step>
<Step>

### Dán workflow có dry-run

```yaml
name: Cleanup Actions retention

on:
  schedule:
    - cron: "15 2 * * 1"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Chỉ in ra thay vì xóa"
        type: boolean
        default: true
      retention_days:
        description: "Xóa artifact cũ hơn số ngày này"
        type: number
        default: 30

permissions:
  actions: write
  contents: read

concurrency:
  group: actions-retention-cleanup
  cancel-in-progress: false

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Cleanup old artifacts
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
          DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run || 'false' }}
          RETENTION_DAYS: ${{ github.event_name == 'workflow_dispatch' && inputs.retention_days || 30 }}
        run: |
          set -euo pipefail

          cutoff_epoch="$(date -u -d "-${RETENTION_DAYS} days" +%s)"
          echo "Retention days: ${RETENTION_DAYS}"
          echo "Dry run: ${DRY_RUN}"
          echo "Cutoff epoch: ${cutoff_epoch}"

          page=1
          while :; do
            payload="$(gh api "repos/${REPO}/actions/artifacts?per_page=100&page=${page}")"
            count="$(jq '.artifacts | length' <<<"${payload}")"
            [ "${count}" -eq 0 ] && break

            jq -c '.artifacts[]' <<<"${payload}" | while read -r artifact; do
              id="$(jq -r '.id' <<<"${artifact}")"
              name="$(jq -r '.name' <<<"${artifact}")"
              created_at="$(jq -r '.created_at' <<<"${artifact}")"
              expired="$(jq -r '.expired' <<<"${artifact}")"

              case "${name}" in
                evidence-*|audit-*)
                  echo "KEEP ${id} ${name} (protected prefix)"
                  continue
                  ;;
              esac

              created_epoch="$(date -u -d "${created_at}" +%s)"
              if [ "${expired}" = "true" ] || [ "${created_epoch}" -lt "${cutoff_epoch}" ]; then
                if [ "${DRY_RUN}" = "true" ]; then
                  echo "DRY_RUN delete ${id} ${name} created_at=${created_at} expired=${expired}"
                else
                  echo "DELETE ${id} ${name}"
                  if ! gh api --method DELETE "repos/${REPO}/actions/artifacts/${id}" >/dev/null; then
                    echo "WARN: artifact ${id} may already be gone" >&2
                  fi
                fi
              else
                echo "KEEP ${id} ${name} created_at=${created_at}"
              fi
            done

            [ "${count}" -lt 100 ] && break
            page=$((page+1))
          done
```

</Step>
<Step>

### Chạy thử và xác minh

- Chạy workflow bằng `workflow_dispatch` với `dry_run: true` trước.
- Kiểm tra log chỉ có `KEEP` và `DRY_RUN delete`.
- Chỉ chuyển sang `dry_run: false` sau khi đã xác nhận allowlist/denylist đúng.
- Chạy lại workflow nhiều lần để đảm bảo lần chạy sau không tạo lỗi nếu artifact đã bị xóa ở lần trước.

</Step>
</Steps>

### Idempotency và phạm vi xóa

Cleanup tốt phải chịu được việc chạy lại nhiều lần.

- Xóa theo danh sách đã lọc, không xóa theo suy đoán.
- Khi artifact đã bị xóa bởi một run trước, lần chạy sau phải coi đó là trạng thái bình thường.
- Nếu delete gặp `404`, job có thể ghi cảnh báo rồi tiếp tục với item khác.
- Phạm vi xóa phải có allowlist/denylist rõ ràng. Đừng đổi một job cleanup chung thành “xóa mọi thứ cũ hơn X ngày” nếu repo còn chứa bằng chứng.

### Không xóa evidence audit

<Callout type="error" title="Cảnh báo về evidence">
  Evidence audit không được đi chung luồng với artifact build ngắn hạn. Nếu bạn xóa nhầm bằng job định kỳ, bạn có thể làm mất khả năng điều tra sự cố hoặc chứng minh tuân thủ.
</Callout>

Cách an toàn hơn là:

- gắn prefix riêng như `evidence-` hoặc `audit-`,
- tách sang repository hoặc storage riêng,
- duyệt thủ công trước khi xóa,
- chỉ cho phép cleanup tự động trên artifact tạm thời.

## Quyền và policy

### Quyền tối thiểu

- **List artifacts**: cần quyền **Actions: read**.
- **Delete artifact**: cần quyền **Actions: write**.
- **Delete workflow run bằng UI hoặc `gh`**: cần quyền đủ mạnh để xóa run trong repository, thường là quyền write hoặc admin tùy policy của repo.
- **Chạy cleanup workflow**: nên đặt `permissions: actions: write` cho job đó, và không cấp quyền này cho luồng không tin cậy.

<Callout type="info" title="Nguyên tắc cấp quyền">
  Chỉ job quản trị retention mới được phép xóa. Job build/test bình thường không nên có quyền `actions: write` nếu không cần.
</Callout>

### Thiết lập policy ở repo và org

Khi bạn vận hành nhiều repository, hãy chuẩn hóa retention ở cấp organization hoặc enterprise, rồi để repo chỉ được phép siết chặt hơn, không được nới rộng vượt chuẩn.

Một mô hình dễ quản trị là:

- **Enterprise** đặt trần tuân thủ chung.
- **Organization** đặt mặc định cho nhóm repo cùng loại.
- **Repository** chỉ tinh chỉnh ngắn hơn khi có nhu cầu đặc biệt.

Nếu một repo cần giữ evidence lâu hơn policy chung, đừng nới toàn bộ artifact retention. Hãy tạo luồng lưu trữ riêng cho evidence và giữ cleanup tự động chỉ áp dụng cho dữ liệu tạm thời.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `retention-days` bị bỏ qua | Giá trị bạn đặt vượt quá giới hạn của repo, org, hoặc enterprise | Giảm số ngày trong workflow hoặc nâng policy cấp cao hơn |
| Artifact biến mất quá sớm | Job cleanup xóa nhầm, hoặc rule lọc quá rộng | Thêm allowlist/denylist, kiểm tra prefix `evidence-` và `audit-` |
| `gh api` trả `403` khi xóa | Token không có quyền `Actions: write` | Cấp đúng quyền cho `GITHUB_TOKEN` hoặc dùng token phù hợp hơn |
| Cleanup chạy lại và báo lỗi | Artifact đã bị xóa ở lần trước | Coi trạng thái đó là bình thường, ghi nhận rồi tiếp tục |
| Cache không được restore | `key` đổi, `restore-keys` không khớp, hoặc cache đã bị GitHub evict | Kiểm tra key, kiểm tra phạm vi branch, và đừng dùng cache cho dữ liệu cần giữ lâu |
| Dữ liệu audit bị xóa nhầm | Không tách rõ evidence khỏi artifact tạm thời | Đổi sang prefix riêng, tách storage riêng, và thêm bước review thủ công |
| Không tìm thấy workflow run cần xóa | Lọc sai run ID hoặc sai repository | Dùng `gh run list` hoặc REST API list trước khi delete |

## Tài liệu tham khảo

- [Store and share data with workflow artifacts](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/storing-workflow-data-as-artifacts)
- [Dependency caching reference](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)
- [REST API endpoints for GitHub Actions artifacts](https://docs.github.com/en/rest/actions/artifacts)
- [REST API endpoints for workflow runs](https://docs.github.com/en/rest/actions/workflow-runs)
- [gh run delete](https://cli.github.com/manual/gh_run_delete)
