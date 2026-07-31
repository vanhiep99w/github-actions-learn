---
title: "CI với database service containers"
description: "Thiết kế integration test ổn định với PostgreSQL, Redis và MySQL service containers trong GitHub Actions."
---

<Callout type="info" title="Phạm vi">
  Hướng dẫn dùng PostgreSQL làm luồng chính cho một ứng dụng Node.js chạy trên Linux runner. Các lệnh `db:migrate:test`, `db:seed:test` và `test:integration:ci` là hợp đồng mà repository cần cung cấp; phần còn lại của workflow có thể sao chép trực tiếp. Redis, MySQL và job container được trình bày dưới dạng biến thể.
</Callout>

## Mục lục

- [Mô hình tư duy](#mô-hình-tư-duy)
  - [Vòng đời của service container](#vòng-đời-của-service-container)
  - [Runner trực tiếp và job container](#runner-trực-tiếp-và-job-container)
  - [Luồng của một integration test](#luồng-của-một-integration-test)
- [Chuẩn bị hợp đồng kiểm thử](#chuẩn-bị-hợp-đồng-kiểm-thử)
  - [Scripts mà repository phải cung cấp](#scripts-mà-repository-phải-cung-cấp)
  - [Test credentials và secrets](#test-credentials-và-secrets)
- [Workflow PostgreSQL hoàn chỉnh](#workflow-postgresql-hoàn-chỉnh)
  - [Cấu hình có thể sao chép](#cấu-hình-có-thể-sao-chép)
  - [Health check và readiness](#health-check-và-readiness)
  - [Giải thích các quyết định chính](#giải-thích-các-quyết-định-chính)
- [Migration seed isolation và cleanup](#migration-seed-isolation-và-cleanup)
  - [Migration chỉ chạy một lần](#migration-chỉ-chạy-một-lần)
  - [Seed nhỏ và xác định](#seed-nhỏ-và-xác-định)
  - [Cô lập từng test và test chạy song song](#cô-lập-từng-test-và-test-chạy-song-song)
  - [Cleanup đúng phạm vi](#cleanup-đúng-phạm-vi)
- [Job container và nhiều service](#job-container-và-nhiều-service)
  - [Chuyển workflow sang job container](#chuyển-workflow-sang-job-container)
  - [Thêm Redis](#thêm-redis)
  - [Thêm MySQL](#thêm-mysql)
  - [Phối hợp nhiều service](#phối-hợp-nhiều-service)
- [Tránh flaky tests](#tránh-flaky-tests)
  - [Đợi điều kiện thay vì ngủ cố định](#đợi-điều-kiện-thay-vì-ngủ-cố-định)
  - [Kiểm soát thời gian và song song](#kiểm-soát-thời-gian-và-song-song)
  - [Pin phiên bản có chủ đích](#pin-phiên-bản-có-chủ-đích)
- [Debugging logs và artifacts](#debugging-logs-và-artifacts)
  - [Thu thập bằng chứng khi thất bại](#thu-thập-bằng-chứng-khi-thất-bại)
  - [Đọc lỗi theo thứ tự](#đọc-lỗi-theo-thứ-tự)
- [Bài thực hành](#bài-thực-hành)
  - [Yêu cầu](#yêu-cầu)
  - [Tiêu chí xác minh](#tiêu-chí-xác-minh)
- [Troubleshooting](#troubleshooting)
- [Best practices](#best-practices)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

## Mô hình tư duy

Service container là một container Docker phụ trợ thuộc về **một job**. Nó phù hợp cho database, cache, message broker hoặc mock server mà ứng dụng cần trong integration test. Integration test là bài kiểm tra nhiều thành phần thật phối hợp với nhau, khác unit test vốn thường thay database bằng mock.

### Vòng đời của service container

GitHub Actions thực hiện vòng đời sau cho mỗi job:

1. Cấp runner Linux.
2. Tạo network Docker riêng cho job.
3. Tạo các service trong `jobs.<job_id>.services`.
4. Chờ service có health check chuyển sang trạng thái healthy.
5. Chạy các steps của job.
6. Dừng và xóa service khi job kết thúc, kể cả khi test thất bại.

Mỗi job nhận service mới. Hai job trong matrix không dùng chung PostgreSQL và không thấy dữ liệu của nhau. Đây là lớp cô lập ở mức job, nhưng các test **trong cùng một job** vẫn có thể làm bẩn dữ liệu của nhau nếu test suite không reset trạng thái.

<Callout type="warn" title="Chỉ dùng runner Linux">
  Docker container actions, job containers và service containers cần Linux. Trên GitHub-hosted runner, hãy dùng một Ubuntu runner. Self-hosted runner cũng phải chạy Linux và cài Docker; không đặt workflow này trên Windows hoặc macOS runner.
</Callout>

Service container không được khai báo bên trong composite action. Hãy khai báo `services` tại job gọi composite action, rồi truyền host và port vào action qua input hoặc biến môi trường.

### Runner trực tiếp và job container

Cùng một PostgreSQL service nhưng địa chỉ kết nối thay đổi theo nơi các steps chạy:

| Nơi steps chạy | Hostname của PostgreSQL | Port ứng dụng dùng | Có cần `services.postgres.ports` không |
|---|---|---|---|
| Trực tiếp trên `ubuntu-latest` | `127.0.0.1` hoặc `localhost` | Host port đã publish | Có |
| Trong `container:` của job | `postgres`, tức service ID | Container port `5432` | Không |

Với job chạy trực tiếp trên runner, cấu hình sau yêu cầu Docker chọn một host port đang rảnh:

```yaml
services:
  postgres:
    image: postgres:17-bookworm
    ports:
      - 5432/tcp
```

Port thực tế được đọc bằng `${{ job.services.postgres.ports[5432] }}`. Dynamic port tránh xung đột trên self-hosted runner khi nhiều job cùng chạy. Nếu ghi `5432:5432`, ứng dụng luôn dùng `localhost:5432`, nhưng hai job đồng thời trên cùng Docker host có thể tranh port.

Với job container, GitHub đặt job và services trên cùng user-defined bridge network, tức network Docker riêng có DNS nội bộ. Tên `postgres` tự động trở thành hostname, và mọi container trên network đó truy cập trực tiếp port `5432` mà không publish ra Docker host.

<Callout type="error" title="Hai lỗi hostname phổ biến">
  `postgres:5432` không hoạt động khi steps chạy trực tiếp trên runner. Ngược lại, `localhost:5432` trong job container trỏ về chính job container, không trỏ về PostgreSQL. Hãy chọn địa chỉ theo mô hình mạng, không theo cấu hình local Docker Compose một cách máy móc.
</Callout>

### Luồng của một integration test

```mermaid
sequenceDiagram
  participant G as GitHub Actions
  participant P as PostgreSQL service
  participant A as Ứng dụng trong job
  participant T as Test suite

  G->>P: Tạo container với database test
  loop Health check
    G->>P: pg_isready
    P-->>G: starting hoặc healthy
  end
  G->>A: npm ci
  A->>P: SELECT 1 để xác minh readiness
  A->>P: Chạy migration
  A->>P: Seed fixture tối thiểu
  G->>T: Chạy integration tests
  T->>P: Transaction hoặc schema riêng
  P-->>T: Kết quả truy vấn thật
  G->>G: Thu JUnit và service logs khi lỗi
  G->>P: Xóa service khi job kết thúc
```

Health check trả lời “tiến trình database đã sẵn sàng nhận kết nối chưa?”. Migration trả lời “schema có đúng phiên bản ứng dụng không?”. Seed tạo dữ liệu nền có kiểm soát. Test isolation bảo đảm test thứ hai không phụ thuộc dữ liệu test thứ nhất. Bốn trách nhiệm này cần tách riêng để log chỉ ra đúng giai đoạn hỏng.

## Chuẩn bị hợp đồng kiểm thử

### Scripts mà repository phải cung cấp

Workflow chính giả định repository đã commit `package-lock.json` và có ba scripts ổn định:

```json title="package.json"
{
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "db:migrate:test": "node scripts/migrate-test.mjs",
    "db:seed:test": "node scripts/seed-test.mjs",
    "test:integration:ci": "node scripts/run-integration-tests-ci.mjs"
  }
}
```

Tên công cụ bên trong có thể là Prisma, Drizzle, Knex, Sequelize, TypeORM, Flyway hoặc migration tool của framework. Hợp đồng quan trọng hơn tên công cụ:

- `db:migrate:test` phải chạy **toàn bộ migration đã commit**, thoát khác `0` khi migration lỗi và không tự sinh migration mới trong CI.
- `db:seed:test` chỉ tạo fixture tổng quát, xác định và an toàn để chạy trên database test.
- `test:integration:ci` phải chạy không tương tác, trả exit code đúng và ghi JUnit XML vào `reports/junit.xml` ngay cả khi có test fail.

JUnit XML là định dạng report máy đọc được mà nhiều test framework hỗ trợ. Cấu hình reporter nằm trong repository để local và CI dùng cùng một lệnh. Không nhúng một chuỗi cờ Jest, Vitest hoặc Mocha cụ thể vào workflow chung vì cú pháp reporter của mỗi công cụ khác nhau.

Một cấu trúc dễ duy trì:

```text
project/
├── .github/workflows/integration.yml
├── migrations/
├── scripts/
│   ├── migrate-test.mjs
│   ├── seed-test.mjs
│   └── run-integration-tests-ci.mjs
├── tests/integration/
├── package.json
└── package-lock.json
```

### Test credentials và secrets

Database trong workflow mẫu được publish qua một host port ngẫu nhiên; application kết nối tới port đó bằng loopback `127.0.0.1`. Dynamic port tránh xung đột, nhưng không phải firewall: Docker thường publish port trên mọi interface của host. GitHub-hosted runner dùng VM cô lập tồn tại trong thời gian ngắn. Với self-hosted runner, hãy dùng máy chuyên dụng hoặc ephemeral và firewall chặn truy cập ngoài ý muốn; một job `container:` còn có thể giữ database trong bridge network mà không publish host port.

Service chỉ tồn tại trong vài phút và chứa dữ liệu giả. Vì vậy, một credential tĩnh như `ci_user` / `ci_password_not_for_prod` có thể được commit để pull request từ fork vẫn chạy được. Credential này **không phải secret**; tên của nó phải cho thấy rõ không được tái sử dụng ngoài CI.

Không bao giờ đưa password production, staging dump hoặc token cloud vào service test. Pull request chạy code từ contributor, nên bất kỳ secret nào được cấp cho job đều có thể bị code đó đọc.

Nếu chính sách nội bộ yêu cầu lưu cả test password trong GitHub Actions secret, có thể dùng cùng secret cho service và application:

```yaml
services:
  postgres:
    image: postgres:17-bookworm
    env:
      POSTGRES_USER: ci_user
      POSTGRES_PASSWORD: ${{ secrets.CI_POSTGRES_PASSWORD }}
      POSTGRES_DB: app_test

steps:
  - name: Run migrations
    env:
      PGUSER: ci_user
      PGPASSWORD: ${{ secrets.CI_POSTGRES_PASSWORD }}
    run: npm run db:migrate:test
```

Cách này có một trade-off quan trọng: ngoại trừ `GITHUB_TOKEN`, Actions secrets không được cấp cho pull request từ fork và Dependabot. Secret chưa cấu hình cũng được đánh giá thành chuỗi rỗng. Nếu muốn nhận đóng góp từ fork, test-only credential cố định thường an toàn và ít lỗi hơn.

<Callout type="warn" title="Không in connection string">
  GitHub tự che giá trị đã lưu dưới dạng secret, nhưng không bảo đảm nhận ra mọi biến thể đã URL-encode hoặc cắt nhỏ. Đừng `echo` password, `DATABASE_URL`, toàn bộ `secrets` context hoặc environment. Dùng `::add-mask::VALUE` cho dữ liệu nhạy cảm được tạo lúc chạy nhưng không nằm trong GitHub Secrets.
</Callout>

Credential cho **private container registry** là trường hợp khác. Đặt chúng trong `services.<service_id>.credentials` bằng secrets có quyền chỉ đọc image. Không dùng database password làm registry password và không cấp quyền package write cho một job chỉ chạy test.

## Workflow PostgreSQL hoàn chỉnh

### Cấu hình có thể sao chép

Tạo `.github/workflows/integration.yml`. Workflow dùng Node.js 24, PostgreSQL 17 trên Debian Bookworm và major actions hiện hành `checkout@v7`, `setup-node@v7`, `upload-artifact@v7`.

```yaml title=".github/workflows/integration.yml"
name: Integration tests

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: integration-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  postgres-integration:
    name: PostgreSQL integration
    runs-on: ubuntu-latest
    timeout-minutes: 20

    services:
      postgres:
        image: postgres:17-bookworm
        env:
          POSTGRES_USER: ci_user
          POSTGRES_PASSWORD: ci_password_not_for_prod
          POSTGRES_DB: app_test
        ports:
          - 5432/tcp
        options: >-
          --health-cmd "pg_isready -U ci_user -d app_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12

    steps:
      - name: Check out source
        uses: actions/checkout@v7
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json

      - name: Install locked dependencies
        run: npm ci

      - name: Configure test connection
        shell: bash
        run: |
          {
            echo "PGHOST=127.0.0.1"
            echo "PGPORT=${{ job.services.postgres.ports[5432] }}"
            echo "PGUSER=ci_user"
            echo "PGPASSWORD=ci_password_not_for_prod"
            echo "PGDATABASE=app_test"
            echo "DATABASE_URL=postgresql://ci_user:ci_password_not_for_prod@127.0.0.1:${{ job.services.postgres.ports[5432] }}/app_test"
          } >> "$GITHUB_ENV"

      - name: Verify PostgreSQL readiness
        shell: bash
        run: |
          set -euo pipefail
          postgres_id="${{ job.services.postgres.id }}"

          for attempt in {1..15}; do
            if docker exec "$postgres_id" \
              psql -U ci_user -d app_test -v ON_ERROR_STOP=1 \
              -c "SELECT 1" >/dev/null; then
              echo "PostgreSQL accepted a test query on attempt $attempt"
              exit 0
            fi
            sleep 2
          done

          docker inspect --format='{{json .State.Health}}' "$postgres_id" || true
          docker logs "$postgres_id" || true
          exit 1

      - name: Apply committed migrations
        run: npm run db:migrate:test

      - name: Seed deterministic fixtures
        run: npm run db:seed:test

      - name: Run integration tests
        run: |
          mkdir -p reports
          npm run test:integration:ci

      - name: Collect PostgreSQL diagnostics
        if: failure()
        shell: bash
        run: |
          mkdir -p artifacts/services
          postgres_id="${{ job.services.postgres.id }}"
          docker inspect \
            --format '{{json .State.Health}}' \
            "$postgres_id" \
            > artifacts/services/postgres-health.json 2>&1 || true
          docker logs --timestamps "$postgres_id" \
            > artifacts/services/postgres.log 2>&1 || true

      - name: Upload test reports and service logs
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: postgres-integration-${{ github.run_attempt }}
          path: |
            reports/
            artifacts/services/
          if-no-files-found: warn
          retention-days: 14
```

Trước khi dùng, đổi Node và PostgreSQL theo runtime production, rồi hiện thực ba scripts trong `package.json`. Nếu default branch không phải `main`, sửa `push.branches`. Nếu lockfile nằm trong monorepo, sửa cả `cache-dependency-path` lẫn `working-directory` của các bước npm.

### Health check và readiness

`options` được chuyển thành tham số Docker khi tạo service. Health check gọi `pg_isready` mỗi 5 giây và cho phép 12 lần thất bại. Nếu container không bao giờ healthy, job dừng ở bước hệ thống **Initialize containers** trước khi code repository chạy.

Health check chỉ xác nhận trạng thái của container. Bước `Verify PostgreSQL readiness` chạy thêm `SELECT 1` trên đúng user và database mà test sử dụng. Đây là readiness probe, tức phép kiểm tra service có thật sự đáp ứng một thao tác tối thiểu của ứng dụng hay không.

Vòng retry có deadline 30 giây và in số lần thử. Nó tốt hơn `sleep 30` vì database nhanh sẽ không phải chờ đủ 30 giây, còn database chậm để lại bằng chứng rõ ràng. `docker exec` dùng `${{ job.services.postgres.id }}`, ID chính xác của service trong job context.

<Callout type="info" title="Tại sao cần cả hai lớp">
  Health check giúp GitHub không bắt đầu steps quá sớm. Query readiness tạo lỗi gần mã ứng dụng hơn và kiểm tra đúng database. Không kéo dài retry vô hạn: service không sẵn sàng sau một ngưỡng hợp lý thường là lỗi cấu hình cần sửa, không phải lý do để ngủ thêm vài phút.
</Callout>

### Giải thích các quyết định chính

- **Dynamic port:** `5432/tcp` để Docker chọn host port. Biểu thức `job.services.postgres.ports[5432]` lấy port đó sau khi service được tạo.
- **Lockfile:** `npm ci` cài đúng `package-lock.json`; cache chỉ lưu kho package, không thay thế bước cài.
- **Quyền tối thiểu:** `contents: read` đủ để checkout. Workflow không cần `packages: write`, `pull-requests: write` hay OIDC.
- **Không giữ Git credential:** `persist-credentials: false` giảm khả năng script test dùng token checkout cho lệnh Git ngoài ý muốn.
- **Timeout:** 20 phút chặn migration hoặc test treo. Hãy điều chỉnh bằng dữ liệu lịch sử, nhưng không bỏ timeout.
- **Concurrency:** commit mới trên cùng pull request hoặc ref hủy run cũ. Mỗi run vẫn có database riêng; concurrency ở đây tiết kiệm runner, không phải cơ chế database locking.
- **Artifacts:** JUnit và diagnostics được upload kể cả khi test fail. `github.run_attempt` giúp tên khác nhau giữa các lần re-run trong cùng workflow run.

Major tag như `actions/checkout@v7` dễ đọc và nhận bản vá tương thích trong cùng major. Với threat model nghiêm ngặt, pin action bằng full commit SHA và dùng Dependabot hoặc Renovate mở pull request cập nhật SHA.

## Migration seed isolation và cleanup

### Migration chỉ chạy một lần

Migration là thay đổi có version để đưa schema từ trạng thái cũ sang trạng thái mới. Trong mỗi job, hãy chạy migration sau readiness và trước seed. Chỉ một process làm việc này; không để từng test worker cùng gọi migration vì hai worker có thể đồng thời tạo cùng table hoặc index.

CI nên chạy migration giống production thay vì dùng ORM `sync`, `push` hoặc tự động dựng schema từ model. Schema sync có thể che migration bị thiếu: model hiện tại tạo được database mới nhưng production database nâng cấp từ phiên bản trước lại thất bại.

Nên bổ sung một bài kiểm tra riêng cho đường nâng cấp nếu migration quan trọng:

1. Khởi tạo schema ở phiên bản phát hành gần nhất.
2. Nạp fixture tương thích phiên bản cũ.
3. Chạy migration mới.
4. Xác minh dữ liệu còn đọc được và constraint mới đúng.

Luồng chính trong pull request vẫn nên kiểm tra migration trên database trống vì nhanh và dễ chẩn đoán.

### Seed nhỏ và xác định

Seed là dữ liệu nền để test bắt đầu từ một trạng thái đã biết. Một seed tốt có các đặc điểm sau:

- Dùng ID, timestamp và timezone cố định.
- Chỉ tạo role, tenant hoặc reference data dùng chung.
- Không tải bản sao production và không gọi API bên ngoài.
- Không dùng `Math.random()` nếu không lưu seed ngẫu nhiên vào report.
- Hoặc idempotent, hoặc chỉ chạy đúng một lần trên database mới.

Dữ liệu riêng của từng test nên được tạo ngay trong test hoặc fixture factory. Nếu seed chứa hàng nghìn records không liên quan, thời gian job tăng và test bắt đầu phụ thuộc vào một “thế giới” khó hiểu.

### Cô lập từng test và test chạy song song

Chọn một chiến lược theo hành vi ứng dụng:

| Chiến lược | Phù hợp khi | Điểm cần lưu ý |
|---|---|---|
| Transaction rồi rollback sau mỗi test | Code test và ứng dụng dùng cùng connection/transaction boundary | Không bao phủ tốt luồng commit thật, nhiều connection hoặc background worker |
| Truncate tables và reset sequence | Test cần commit thật nhưng số table vừa phải | Phải xử lý foreign key và thứ tự cleanup chính xác |
| Schema riêng cho mỗi worker | Test runner chạy song song trong cùng PostgreSQL | Connection `search_path`, migration và cleanup phải mang worker ID |
| Database riêng cho mỗi worker | Cần cô lập mạnh hoặc extension/schema phức tạp | Tốn thời gian tạo database và cần quyền `CREATEDB` phù hợp |
| Service riêng cho mỗi matrix job | Shard test ở nhiều jobs | Setup lặp lại nhưng cô lập tốt nhất ở mức hạ tầng |

Nếu chạy bốn workers trên cùng `app_test`, đừng để tất cả tạo user có email `demo@example.com` trừ khi mỗi test rollback. Một cách đơn giản là thêm worker ID vào khóa duy nhất, ví dụ `demo-worker-2@example.test`.

Thời gian cũng là shared state. Hãy đóng băng clock trong ứng dụng hoặc so sánh theo khoảng dung sai có chủ đích. Luôn lưu timestamp UTC trong database nếu production làm vậy; đừng để timezone mặc định của runner quyết định kết quả.

### Cleanup đúng phạm vi

Service được GitHub xóa sau job nên không cần `DROP DATABASE` cuối workflow. Cleanup trong test vẫn cần để ngăn test sau nhìn thấy rows của test trước.

Thứ tự ưu tiên:

1. Rollback transaction hoặc xóa schema riêng trong hook `afterEach`.
2. Nếu test cố ý commit, truncate đúng tables và reset sequence.
3. Nếu một test fail giữa chừng, hook cleanup phải chạy trong `finally` hoặc cơ chế teardown của test framework.
4. Không xóa dữ liệu trước khi đã thu thông tin chẩn đoán cần thiết.

Không upload database dump mặc định. Dump có thể chứa token giả trông giống token thật, dữ liệu do test lỗi ghi ra hoặc dữ liệu nhạy cảm nếu workflow bị cấu hình sai. Nếu buộc phải giữ dump, chỉ dùng dữ liệu tổng hợp, mã hóa artifact theo chính sách tổ chức và đặt retention ngắn.

## Job container và nhiều service

### Chuyển workflow sang job container

Job container hữu ích khi muốn runtime CI gần Docker image development hoặc production. Thay phần job bằng mẫu sau:

```yaml
jobs:
  postgres-integration:
    runs-on: ubuntu-latest
    container: node:24-bookworm-slim
    timeout-minutes: 20

    services:
      postgres:
        image: postgres:17-bookworm
        env:
          POSTGRES_USER: ci_user
          POSTGRES_PASSWORD: ci_password_not_for_prod
          POSTGRES_DB: app_test
        options: >-
          --health-cmd "pg_isready -U ci_user -d app_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12

    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - run: npm ci
      - name: Migrate seed and test
        env:
          DATABASE_URL: postgresql://ci_user:ci_password_not_for_prod@postgres:5432/app_test
        run: |
          npm run db:migrate:test
          npm run db:seed:test
          npm run test:integration:ci
```

Không khai báo `ports` vì job container kết nối trực tiếp `postgres:5432`. Image job phải có shell và các binary mà steps cần. `node:24-bookworm-slim` có Node/npm, nhưng công cụ native khác có thể cần cài thêm hoặc đưa vào image CI riêng.

Workflow runner chính dùng `docker exec`, `docker inspect` và `docker logs`. Các lệnh đó thường không có quyền truy cập Docker daemon từ bên trong job container. Đừng mount Docker socket chỉ để lấy log vì socket trao quyền rất lớn trên host. Với job container, dựa vào health output trong **Set up job**, log ứng dụng, hoặc dùng một client database trong job container để probe `postgres:5432`.

### Thêm Redis

Redis thường đi cùng PostgreSQL cho cache, rate limit hoặc queue. Thêm service sau cạnh `postgres` khi job chạy trực tiếp trên runner:

```yaml
services:
  redis:
    image: redis:7.4-bookworm
    ports:
      - 6379/tcp
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 5s
      --health-timeout 3s
      --health-retries 12

steps:
  - name: Run tests that use Redis
    env:
      REDIS_URL: redis://127.0.0.1:${{ job.services.redis.ports[6379] }}
    run: npm run test:integration:ci
```

Trong job container, bỏ `ports` và dùng `redis://redis:6379`. Nếu production bật ACL hoặc TLS, test suite nên có một job kiểm tra chế độ đó; Redis không password trong network cô lập chỉ phù hợp cho test hành vi không liên quan authentication.

### Thêm MySQL

MySQL 8.4 là dòng LTS. Một service tối thiểu cho runner job:

```yaml
services:
  mysql:
    image: mysql:8.4
    env:
      MYSQL_DATABASE: app_test
      MYSQL_USER: ci_user
      MYSQL_PASSWORD: ci_password_not_for_prod
      MYSQL_ROOT_PASSWORD: root_password_not_for_prod
    ports:
      - 3306/tcp
    options: >-
      --health-cmd "mysqladmin ping -h 127.0.0.1 --silent"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 20

steps:
  - name: Run MySQL integration tests
    env:
      DATABASE_URL: mysql://ci_user:ci_password_not_for_prod@127.0.0.1:${{ job.services.mysql.ports[3306] }}/app_test
    run: |
      npm run db:migrate:test
      npm run db:seed:test
      npm run test:integration:ci
```

MySQL lần đầu thường khởi tạo lâu hơn Redis. Health check có nhiều retries hơn nhưng vẫn có deadline. Hãy cấu hình `sql_mode`, charset và collation giống production khi hành vi truy vấn phụ thuộc chúng; không để default khác nhau làm CI xanh nhưng production lỗi.

### Phối hợp nhiều service

Một job có thể khai báo PostgreSQL, Redis và mock server cùng lúc. Mỗi service có ID, health check và port mapping riêng:

```yaml
services:
  postgres:
    image: postgres:17-bookworm
    env:
      POSTGRES_USER: ci_user
      POSTGRES_PASSWORD: ci_password_not_for_prod
      POSTGRES_DB: app_test
    ports: [5432/tcp]
    options: >-
      --health-cmd "pg_isready -U ci_user -d app_test"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 12

  redis:
    image: redis:7.4-bookworm
    ports: [6379/tcp]
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 5s
      --health-timeout 3s
      --health-retries 12

steps:
  - name: Test PostgreSQL and Redis together
    env:
      DATABASE_URL: postgresql://ci_user:ci_password_not_for_prod@127.0.0.1:${{ job.services.postgres.ports[5432] }}/app_test
      REDIS_URL: redis://127.0.0.1:${{ job.services.redis.ports[6379] }}
    run: npm run test:integration:ci
```

Chỉ thêm service mà scenario thực sự dùng. Mỗi image pull, health check và migration làm phản hồi chậm hơn. Nếu phần lớn test chỉ cần PostgreSQL, tách test PostgreSQL và test phối hợp PostgreSQL–Redis thành suites hoặc jobs có mục tiêu rõ ràng.

## Tránh flaky tests

Flaky test là test lúc xanh lúc đỏ dù code không đổi. Database integration test dễ flaky vì startup, shared state, clock và concurrency đều có timing không cố định.

### Đợi điều kiện thay vì ngủ cố định

Ưu tiên ba lớp:

1. Docker health check trong `services.<id>.options`.
2. Readiness query có retry, deadline và log từng lần thử.
3. Poll điều kiện nghiệp vụ khi test background job, ví dụ chờ row chuyển sang `processed` với timeout 5 giây.

Không dùng `sleep 10` rồi hy vọng mọi máy đủ nhanh. Không retry toàn bộ test suite vô điều kiện vì retry có thể che race condition thật. Nếu phải retry tạm thời, chỉ retry lỗi hạ tầng đã phân loại, giới hạn số lần và ghi metric để xóa retry sau khi sửa nguyên nhân.

Các biện pháp khác:

- Sắp xếp kết quả bằng `ORDER BY` trước khi assert danh sách; SQL không bảo đảm thứ tự nếu thiếu `ORDER BY`.
- Dùng constraint thật và chờ transaction commit trước khi process khác đọc.
- Không dùng port cố định trên shared self-hosted runner.
- Tắt test parallel trước để chứng minh isolation; chỉ bật lại sau khi có schema/database per worker hoặc transaction strategy rõ ràng.
- Không phụ thuộc thứ tự file test hoặc dữ liệu seed ngầm.
- Cố định locale, timezone và clock khi chúng ảnh hưởng query.

### Kiểm soát thời gian và song song

`timeout-minutes` ở job là lưới an toàn cuối. Test framework vẫn nên có timeout ngắn cho từng test và hook. Ví dụ, một query bình thường phải hoàn thành trong 2 giây không nên được che bởi job timeout 20 phút.

`concurrency.cancel-in-progress: true` phù hợp cho pull request vì commit cũ không còn giá trị. Tuy nhiên, không dùng cùng một concurrency group cho các branch khác nhau nếu muốn chúng chạy độc lập. Biểu thức trong workflow chính gồm `github.workflow` và số pull request hoặc ref để tránh workflow khác hủy nhầm nhau.

Nếu dùng matrix để kiểm tra nhiều PostgreSQL major:

```yaml
strategy:
  fail-fast: false
  matrix:
    postgres: ["16-bookworm", "17-bookworm"]

services:
  postgres:
    image: postgres:${{ matrix.postgres }}
```

Mỗi matrix job có service riêng. `fail-fast: false` cho phép thấy toàn bộ major nào hỏng. Chỉ đưa phiên bản production và phiên bản đang chuẩn bị nâng cấp vào matrix; không nhân chi phí với các phiên bản không hỗ trợ.

### Pin phiên bản có chủ đích

`postgres:17-bookworm` cố định major và distro nhưng tag vẫn có thể trỏ đến patch image mới. Đây thường là cân bằng hợp lý để nhận security patch trong PostgreSQL 17. Với yêu cầu tái lập nghiêm ngặt, lấy RepoDigest bất biến sau khi pull image đã review:

```bash
docker pull postgres:17-bookworm
docker image inspect postgres:17-bookworm \
  --format '{{index .RepoDigests 0}}'
```

Lệnh trả về tên image theo dạng `postgres@sha256:...`. Dùng toàn bộ giá trị đó cho khóa `image`, review provenance rồi để Dependabot hoặc Renovate cập nhật digest bằng pull request. Cùng nguyên tắc áp dụng cho Redis, MySQL, job container và actions pin bằng SHA.

<Callout type="warn" title="Khớp production trước khi chọn bản mới nhất">
  Integration test cần mô phỏng engine, extension, collation và cấu hình production. Dùng `latest` có thể tự động đổi major và tạo lỗi bất ngờ; dùng major khác production có thể bỏ sót incompatibility. Hãy nâng phiên bản bằng pull request có chủ đích.
</Callout>

## Debugging logs và artifacts

### Thu thập bằng chứng khi thất bại

Bước `Collect PostgreSQL diagnostics` trong workflow chính dùng `if: failure()` nên chạy sau migration hoặc test fail. Nó lưu hai loại bằng chứng:

- `postgres-health.json`: trạng thái và lịch sử health check đã được trích riêng.
- `postgres.log`: stdout/stderr của PostgreSQL kèm timestamp.

Không upload toàn bộ `docker inspect`: trường `Config.Env` có thể chứa `POSTGRES_PASSWORD` hoặc credential khác. Secret masking chỉ lọc console log; nó không xóa secret đã ghi vào nội dung artifact.

Bước upload dùng `if: always()` để report vẫn được giữ khi job thất bại. `actions/upload-artifact@v7` tạo artifact bất biến; đừng để nhiều matrix jobs cùng upload một tên. Thêm engine, version, shard hoặc `strategy.job-index` vào tên khi mở rộng matrix.

Test runner phải ghi `reports/junit.xml` trước khi thoát. Artifact report cho biết test case nào fail ngay cả khi console bị rút gọn. Retention 14 ngày phù hợp cho chẩn đoán pull request; hãy chọn theo chính sách dữ liệu và chi phí của tổ chức.

<Callout type="error" title="Artifact cũng là nơi lưu dữ liệu">
  Trước khi upload, kiểm tra log và report không chứa password, authorization header, connection string hoặc dữ liệu người dùng. Không bật `log_statement = all` trong CI nếu query có thể mang token hay payload nhạy cảm. GitHub masking không thay thế việc lọc dữ liệu.
</Callout>

Nếu job fail ở **Initialize containers**, các steps chưa bắt đầu nên bước thu log tùy chỉnh không chạy. Mở log **Set up job** để xem image pull, lệnh tạo container và health output. Trên self-hosted runner có quyền phù hợp, quản trị viên cũng có thể kiểm tra Docker daemon logs; workflow không nên giả định container còn tồn tại sau cleanup.

### Đọc lỗi theo thứ tự

1. **Set up job:** image có pull được không, service có healthy không, port có publish được không.
2. **Verify readiness:** đúng database/user chưa, query tối thiểu có chạy không.
3. **Migration:** migration file nào fail, schema version trước lỗi là gì.
4. **Seed:** constraint nào bị vi phạm, seed có chạy lặp ngoài ý muốn không.
5. **Test report:** test case đầu tiên fail là gì; lỗi sau có thể chỉ là hậu quả.
6. **Service log:** database restart, out-of-memory, deadlock hoặc connection exhaustion có xuất hiện không.

Để tải log từ CLI:

```bash
gh run view RUN_ID --log-failed
gh run download RUN_ID --name postgres-integration-1
```

Có thể bật runner debug và step debug trong repository secrets theo tài liệu GitHub khi log mặc định chưa đủ. Chỉ bật trong thời gian ngắn vì debug log lớn hơn và có thể lộ thêm metadata.

## Bài thực hành

### Yêu cầu

1. Chuẩn bị một ứng dụng Node.js có `package-lock.json`, ít nhất hai migration và một endpoint hoặc repository layer đọc PostgreSQL.
2. Hiện thực ba scripts `db:migrate:test`, `db:seed:test` và `test:integration:ci` theo hợp đồng của trang này.
3. Thêm workflow PostgreSQL hoàn chỉnh. Không đổi dynamic port thành port cố định.
4. Viết ít nhất ba integration tests: ghi rồi đọc một record; kiểm tra unique constraint; kiểm tra rollback hoặc cleanup giữa hai tests.
5. Cấu hình JUnit reporter ghi `reports/junit.xml`.
6. Cố ý làm hỏng một migration trong một commit, quan sát logs/artifact, rồi sửa ở commit tiếp theo.
7. Thêm Redis và một test chứng minh cache miss đọc PostgreSQL rồi cache hit đọc Redis.
8. Push nhanh hai commit vào cùng pull request để quan sát run cũ bị hủy bởi concurrency.

### Tiêu chí xác minh

- [ ] Workflow chỉ có `permissions: contents: read` và không nhận production secret.
- [ ] PostgreSQL dùng health check, test query readiness và deadline hữu hạn.
- [ ] Ứng dụng kết nối `127.0.0.1` bằng `${{ job.services.postgres.ports[5432] }}`.
- [ ] Migration chạy trước seed; test không dùng ORM schema sync thay migration.
- [ ] Hai lần chạy workflow liên tiếp đều xanh trên service mới, không cần dữ liệu từ run trước.
- [ ] Chạy test theo thứ tự đảo ngược vẫn xanh.
- [ ] Bật test parallel không gây duplicate key hoặc cross-test pollution; nếu chưa hỗ trợ, cấu hình chạy tuần tự được ghi rõ.
- [ ] Test fail tạo `reports/junit.xml`; artifact có report và PostgreSQL diagnostics, không chứa credential nhạy cảm.
- [ ] Redis dùng dynamic port và có health check `redis-cli ping`.
- [ ] Một test bị treo không thể vượt `timeout-minutes` của job.
- [ ] Commit mới trên cùng pull request hủy run cũ nhưng không hủy run của branch khác.
- [ ] Branch protection yêu cầu check `PostgreSQL integration` trước khi merge.

## Troubleshooting

| Triệu chứng | Nguyên nhân cần kiểm tra | Hướng xử lý |
|---|---|---|
| Job fail ở `Initialize containers` với trạng thái unhealthy | Sai health command, sai database/user, image lỗi hoặc số retries quá thấp | Mở **Set up job**, đọc health output; chạy cùng image local; sửa probe trước khi tăng deadline |
| `ECONNREFUSED 127.0.0.1:5432` | Dùng port container thay vì dynamic host port | Dùng `${{ job.services.postgres.ports[5432] }}` hoặc map rõ `5432:5432` nếu thật sự cần port cố định |
| `getaddrinfo ENOTFOUND postgres` trên runner job | `postgres` chỉ là DNS hostname trong job container | Dùng `127.0.0.1` và published host port |
| `ECONNREFUSED localhost:5432` trong job container | `localhost` trỏ về job container | Dùng service ID `postgres` và port `5432`; bỏ mapping không cần thiết |
| `port is already allocated` trên self-hosted runner | Nhiều job map cùng `5432:5432` | Đổi thành `5432/tcp` và đọc port từ job context |
| `password authentication failed` | Credential application khác `services.postgres.env`, password secret rỗng trên fork, hoặc URL encode sai | Đồng bộ credential test; ưu tiên biến `PG*`; không phụ thuộc secret cho fork PR nếu không cần |
| `database app_test does not exist` | Sai `POSTGRES_DB`, kết nối trước khi init hoàn tất hoặc volume cũ trên self-hosted cấu hình ngoài Actions | Xác minh env và readiness query; không gắn persistent volume cho service CI thông thường |
| `relation already exists` trong migration | Migration chạy hai lần đồng thời hoặc test workers tự migrate | Chạy migration một lần trước test; không migrate trong worker hooks |
| Test unique constraint lúc xanh lúc đỏ | Shared rows, seed ngẫu nhiên hoặc cleanup không reset sequence | Transaction rollback, schema per worker hoặc khóa duy nhất có worker ID; seed cố định |
| Query trả danh sách khác thứ tự | Thiếu `ORDER BY` | Sắp xếp trong SQL hoặc assert tập hợp khi thứ tự không phải yêu cầu nghiệp vụ |
| JUnit artifact trống | Test runner thoát trước khi ghi file hoặc path reporter khác workflow | Cấu hình reporter trong repository; tạo `reports/` trước test; giữ `if-no-files-found: warn` để không che lỗi gốc |
| Không chạy được `docker logs` trong job container | Job container không có Docker CLI/socket | Dùng log **Set up job** và client probe; không mount Docker socket chỉ để debug |
| Redis health xanh nhưng test auth fail | Health check không dùng cùng ACL/TLS mode với ứng dụng | Thêm readiness command bằng đúng chế độ auth; tạo job riêng mô phỏng security config production |
| MySQL xanh local nhưng CI lỗi collation hoặc strict mode | Default image khác cấu hình production | Pin 8.4 và khai báo `command`/config cho `sql_mode`, charset, collation giống production |
| Job bị `Cancelled` khi push commit mới | `cancel-in-progress: true` hoạt động | Đây là mong đợi; nếu branch khác bị hủy, thêm `github.workflow` và ref/PR vào concurrency group |
| Service containers không chạy trên Windows hoặc macOS | Tính năng yêu cầu Linux runner | Chuyển integration job sang Ubuntu; giữ unit matrix đa hệ điều hành ở job khác |
| Action v7 không chạy trên self-hosted runner hoặc GHES | Actions Runner quá cũ hoặc GHES chưa hỗ trợ major artifact action đó | Nâng runner theo release notes; với GHES dùng phiên bản action được instance hỗ trợ |

## Best practices

- **Một service mới cho mỗi job:** không nối CI vào database dùng chung và không cache Docker volume chứa database state.
- **Khớp production có chủ đích:** engine major, extension, collation, timezone và strict mode phải phản ánh môi trường thật.
- **Dynamic host ports:** dùng `5432/tcp`, `6379/tcp`, `3306/tcp` trên runner job để tránh xung đột; đây không phải cơ chế giới hạn network exposure trên self-hosted runner.
- **Đúng hostname theo network:** application trong runner job kết nối qua loopback; job container dùng service ID.
- **Health rồi readiness:** health check chặn startup sớm; query thật xác minh đúng user/database.
- **Migration là sản phẩm:** chạy migration đã commit, không tự generate hoặc schema sync trong CI.
- **Seed tối thiểu:** dữ liệu chung cố định; dữ liệu scenario nằm gần test tạo ra nó.
- **Isolation trước parallelism:** chỉ tăng workers sau khi transaction, schema hoặc database per worker đã rõ ràng.
- **Không retry mù:** retry condition có deadline; không retry cả suite để làm xanh race condition.
- **Không dùng production secrets:** service test dùng credential riêng, quyền thấp và dữ liệu tổng hợp.
- **Quyền workflow tối thiểu:** bắt đầu với `contents: read`; thêm từng quyền khi có bằng chứng cần thiết.
- **Timeout ở nhiều lớp:** health, readiness, từng test và toàn job đều có giới hạn phù hợp.
- **Artifacts an toàn:** upload JUnit và log đã rà soát; tên artifact duy nhất; retention ngắn.
- **Log lỗi trước cleanup:** chỉ thu health state đã lọc và service logs đã rà soát; service sẽ tự bị hủy sau job.
- **Pin và cập nhật qua review:** tránh `latest`; pin major/distro hoặc digest, rồi dùng bot mở pull request nâng cấp.
- **Tách test theo trách nhiệm:** unit test phản hồi nhanh; database integration test xác minh persistence; multi-service test chỉ dành cho luồng thật sự phối hợp.
- **Giữ lệnh local và CI giống nhau:** scripts trong `package.json` là nguồn sự thật, workflow chỉ điều phối.
- **Theo dõi flaky rate:** lưu test report theo thời gian; quarantine chỉ là tạm thời và không được biến thành required check giả xanh.

## Tài liệu tham khảo

- [GitHub Docs — Communicating with Docker service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers)
- [GitHub Docs — Creating PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
- [GitHub Docs — Creating Redis service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-redis-service-containers)
- [GitHub Docs — Workflow syntax for `jobs.<job_id>.services`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idservices)
- [GitHub Docs — `job` context và dynamic service ports](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context)
- [GitHub Docs — Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [GitHub Docs — Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Docs — Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [GitHub Docs — Store and share data with workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)
- [GitHub Docs — Using workflow run logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs)
- [`actions/checkout`](https://github.com/actions/checkout)
- [`actions/setup-node`](https://github.com/actions/setup-node)
- [`actions/upload-artifact`](https://github.com/actions/upload-artifact)
- [Docker Official Image — PostgreSQL](https://hub.docker.com/_/postgres)
- [Docker Official Image — Redis](https://hub.docker.com/_/redis)
- [Docker Official Image — MySQL](https://hub.docker.com/_/mysql)
- [PostgreSQL — `pg_isready`](https://www.postgresql.org/docs/current/app-pg-isready.html)
- [Docker Docs — Health checks](https://docs.docker.com/reference/dockerfile/#healthcheck)
