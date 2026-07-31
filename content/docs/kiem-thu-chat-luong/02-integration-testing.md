---
title: "Integration testing với PostgreSQL"
description: "Thiết kế và vận hành integration test cho Node.js/TypeScript trong GitHub Actions bằng PostgreSQL service container."
---

<Callout title="Mục tiêu" type="info">
  Sau bài này, bạn có thể xác định đúng boundary cần kiểm thử, cô lập dữ liệu giữa các test và xây dựng một quality gate chạy migration rồi kiểm thử ứng dụng với PostgreSQL thật trong GitHub Actions.
</Callout>

## Mục lục

- [Tổng quan](#tổng-quan)
  - [Unit integration và E2E khác nhau ở đâu](#unit-integration-và-e2e-khác-nhau-ở-đâu)
  - [Contract và boundary là gì](#contract-và-boundary-là-gì)
- [Thiết kế integration test với PostgreSQL](#thiết-kế-integration-test-với-postgresql)
  - [Chọn boundary có giá trị](#chọn-boundary-có-giá-trị)
  - [Migration fixture và seed](#migration-fixture-và-seed)
  - [Cô lập dữ liệu](#cô-lập-dữ-liệu)
  - [Parallelism không làm test nhiễu nhau](#parallelism-không-làm-test-nhiễu-nhau)
- [PostgreSQL service container trong GitHub Actions](#postgresql-service-container-trong-github-actions)
  - [Vòng đời và health check](#vòng-đời-và-health-check)
  - [Networking runner job và container job](#networking-runner-job-và-container-job)
  - [Secrets và biến môi trường](#secrets-và-biến-môi-trường)
- [Bài thực hành Node.js và TypeScript](#bài-thực-hành-nodejs-và-typescript)
  - [Cấu trúc tối thiểu](#cấu-trúc-tối-thiểu)
  - [Migration và lớp truy cập dữ liệu](#migration-và-lớp-truy-cập-dữ-liệu)
  - [Integration test bằng Vitest](#integration-test-bằng-vitest)
  - [Scripts và dependencies](#scripts-và-dependencies)
  - [Workflow CI hoàn chỉnh](#workflow-ci-hoàn-chỉnh)
  - [Biến thể container job](#biến-thể-container-job)
- [Quality gate và cách xác minh](#quality-gate-và-cách-xác-minh)
  - [Điều kiện pass fail](#điều-kiện-pass-fail)
  - [Chạy thử ở máy local](#chạy-thử-ở-máy-local)
  - [Xác minh trên GitHub](#xác-minh-trên-github)
- [Best practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)
- [Các bài tiếp theo](#các-bài-tiếp-theo)

## Tổng quan

Integration test kiểm tra cách nhiều thành phần phối hợp qua một **boundary** thực. Boundary là ranh giới nơi ứng dụng giao tiếp với thứ nằm ngoài logic thuần, chẳng hạn PostgreSQL, hệ thống tệp hoặc HTTP API. Trong bài này, boundary được chọn là giao tiếp giữa mã Node.js/TypeScript, driver `pg` và một PostgreSQL thật.

Test với database giả trong bộ nhớ có thể chạy nhanh, nhưng không chứng minh được các hành vi riêng của PostgreSQL. Ví dụ, kiểu `TIMESTAMPTZ`, transaction, unique constraint, foreign key, SQL parameter binding và mã lỗi `23505` chỉ được kiểm chứng đáng tin cậy khi truy vấn một PostgreSQL thật.

### Unit integration và E2E khác nhau ở đâu

Ba lớp kiểm thử trả lời ba câu hỏi khác nhau:

| Lớp kiểm thử | Phạm vi | Dependency thường dùng | Ví dụ lỗi bắt được | Tốc độ tương đối |
|---|---|---|---|---|
| Unit test | Một hàm, class hoặc module | Mock hoặc stub; không I/O thật | Hàm tính sai, nhánh điều kiện thiếu | Nhanh nhất |
| Integration test | Nhiều module qua một boundary | PostgreSQL, Redis hoặc HTTP server thật | SQL sai, migration thiếu, mapping kiểu sai, constraint không hoạt động | Trung bình |
| E2E test | Luồng người dùng từ điểm vào đến hệ thống phía sau | Ứng dụng đã khởi động cùng hạ tầng phụ trợ | Sai routing, auth, UI, cấu hình deploy hoặc luồng nghiệp vụ | Chậm nhất |

Ví dụ với chức năng tạo người dùng:

- Unit test gọi validator và kiểm tra email không hợp lệ mà không mở kết nối database.
- Integration test gọi repository với PostgreSQL thật rồi kiểm tra row và unique constraint.
- E2E test gửi `POST /users` vào server đang chạy rồi xác minh HTTP response và dữ liệu cuối cùng.

Không nên biến mọi test thành integration test. Hãy giữ phần lớn logic thuần ở unit test, dùng integration test cho boundary có rủi ro và dành E2E test cho các hành trình quan trọng.

### Contract và boundary là gì

**Contract** là tập hợp hành vi mà hai phía đã thống nhất tại một boundary. Contract của repository `createUser` không chỉ là kiểu TypeScript. Nó còn gồm schema, giá trị trả về, transaction và lỗi mà database phát sinh.

Ví dụ, contract có thể được viết thành các mệnh đề kiểm chứng được:

- Khi nhận email mới, repository trả về row có `id`, `email` và `created_at`.
- Cột `email` là duy nhất ở cấp database, không chỉ được kiểm tra trong mã ứng dụng.
- Khi chèn email trùng, PostgreSQL trả SQLSTATE `23505`.
- Nếu transaction bị rollback, row vừa tạo không còn tồn tại.

Mock `db.query()` chỉ chứng minh rằng mã đã gọi một chuỗi SQL dự kiến. Integration test chứng minh PostgreSQL thật hiểu câu SQL đó và thực thi đúng contract. Vì vậy, test nên quan sát kết quả tại boundary thay vì kiểm tra chi tiết triển khai như số lần gọi một hàm nội bộ.

## Thiết kế integration test với PostgreSQL

### Chọn boundary có giá trị

Một integration test tốt đi qua đủ lớp để bắt lỗi tích hợp, nhưng vẫn có phạm vi hẹp để chẩn đoán nhanh. Với ứng dụng Node.js, boundary thực dụng thường là:

```text
Test → Repository hoặc service → driver pg → PostgreSQL thật
```

Nên ưu tiên các trường hợp sau:

- Mapping giữa object TypeScript và cột PostgreSQL.
- Constraint `NOT NULL`, `UNIQUE`, `CHECK` và `FOREIGN KEY`.
- Transaction gồm nhiều câu lệnh cần thành công hoặc rollback cùng nhau.
- Query có join, sort, phân trang, timezone hoặc kiểu dữ liệu đặc thù.
- Migration mới phải tương thích với mã ứng dụng hiện tại.
- Xử lý mã lỗi PostgreSQL thành lỗi nghiệp vụ.

Không cần khởi động HTTP server nếu mục tiêu chỉ là contract của repository. Ngược lại, nếu middleware, serialization hoặc auth là boundary cần kiểm tra, hãy mở rộng test đến HTTP layer hoặc chuyển trường hợp đó sang E2E.

### Migration fixture và seed

Ba khái niệm này có vai trò khác nhau:

- **Migration** là thay đổi schema có phiên bản, ví dụ tạo bảng hoặc thêm index. CI phải chạy đúng công cụ migration dùng ở production.
- **Fixture** là dữ liệu tối thiểu do một test tạo để thiết lập điều kiện đầu vào. Ví dụ, test đơn hàng tạo đúng một customer và hai product.
- **Seed** là bộ dữ liệu nền lớn hơn, thường phục vụ môi trường demo hoặc phát triển thủ công.

Thứ tự ổn định là: PostgreSQL sẵn sàng → chạy migration một lần → test tự tạo fixture → test dọn dữ liệu. Không nên dùng ORM `synchronize`, `db push` hoặc tự tạo bảng trong `beforeEach` nếu production dùng migration có phiên bản. Cách đó có thể làm CI xanh dù file migration thật đã hỏng.

Fixture nên nhỏ, rõ và có giá trị xác định:

```ts
const user = {
  email: `integration-${crypto.randomUUID()}@example.com`,
};
```

UUID tránh va chạm khi test chạy đồng thời. Tuy nhiên, dữ liệu ngẫu nhiên không nên làm assertion trở nên ngẫu nhiên. Hãy lưu giá trị đã tạo và so sánh với chính giá trị đó.

<Callout title="Không dùng production dump" type="warn">
  Production dump thường chứa dữ liệu nhạy cảm, rất lớn và khó tái lập. Hãy tạo fixture tổng hợp, tối thiểu và không chứa thông tin cá nhân thật.
</Callout>

### Cô lập dữ liệu

**Isolation** là bảo đảm một test không nhìn thấy hoặc phá dữ liệu của test khác. Có bốn chiến lược phổ biến:

| Chiến lược | Cách làm | Ưu điểm | Giới hạn |
|---|---|---|---|
| Transaction rollback | `BEGIN` trước test, `ROLLBACK` sau test | Nhanh, ít thao tác dọn dẹp | Mọi truy vấn phải dùng cùng connection; không phù hợp khi mã tự commit hoặc mở connection khác |
| `TRUNCATE` | Xóa dữ liệu ở các bảng liên quan sau mỗi test | Dùng được khi có nhiều connection | Cần đúng thứ tự foreign key; khóa bảng và khó chạy song song |
| Schema riêng | Mỗi worker dùng một schema và `search_path` riêng | Song song tốt, giảm va chạm tên | Phải chạy migration cho từng schema hoặc clone schema |
| Database riêng | Mỗi worker hoặc job có database riêng | Cô lập mạnh nhất | Tốn thời gian tạo database và migration |

Ví dụ thực hành phía dưới dùng transaction rollback. Repository nhận connection từ bên ngoài, nên tất cả câu lệnh của một test nằm trong cùng transaction.

PostgreSQL sequence không nhất thiết quay lại số cũ sau rollback. Vì vậy, đừng assert `id === 1`. Hãy assert `id` tồn tại và quan hệ giữa các row là đúng.

### Parallelism không làm test nhiễu nhau

Có hai tầng song song cần phân biệt:

1. **Giữa các GitHub Actions job:** mỗi job có service container riêng. Matrix theo Node.js hoặc PostgreSQL vì thế được cô lập tự nhiên.
2. **Giữa các test worker trong cùng job:** các worker dùng chung service PostgreSQL nếu cùng `DATABASE_URL`. Đây là nơi fixture có thể va chạm.

Để chạy nhiều worker an toàn:

- Dùng giá trị duy nhất cho email, slug và external ID.
- Mỗi test file giữ connection và transaction riêng.
- Không thay đổi schema trong test; migration chỉ chạy một lần trước suite.
- Dùng schema hoặc database theo worker nếu test cần commit thật.
- Với suite nhỏ nhưng có DDL hoặc fixture dùng chung, giảm worker thay vì chấp nhận flaky test. Ví dụ: `vitest run tests/integration --maxWorkers=1`.

`concurrency` của workflow chỉ hủy run cũ trên cùng branch. Nó không cô lập các worker trong một test process. Hai cơ chế này giải quyết hai vấn đề khác nhau.

## PostgreSQL service container trong GitHub Actions

`jobs.<job_id>.services` khai báo container phụ trợ cho một job. GitHub tạo service trước các step, nối mạng theo kiểu job, rồi xóa service khi job kết thúc. Service container yêu cầu Linux runner; với GitHub-hosted runner, hãy dùng Ubuntu.

```mermaid
flowchart LR
  A["GitHub Actions job bắt đầu"] --> B["Tạo PostgreSQL service"]
  B --> C{"Health check thành công?"}
  C -->|Không| D["Dừng job và in log khởi tạo"]
  C -->|Có| E["Checkout và npm ci"]
  E --> F["Chạy migration"]
  F --> G["Chạy integration test"]
  G --> H{"Mọi test đều pass?"}
  H -->|Có| I["Quality gate thành công"]
  H -->|Không| J["Chặn merge"]
  I --> K["GitHub xóa service"]
  J --> K
```

### Vòng đời và health check

Container ở trạng thái “running” chưa chắc PostgreSQL đã nhận kết nối. `pg_isready` là tiện ích chính thức kiểm tra trạng thái kết nối và trả exit code `0` khi server chấp nhận connection.

```yaml
options: >-
  --health-cmd "pg_isready -U app -d app_test"
  --health-interval 5s
  --health-timeout 5s
  --health-retries 10
```

GitHub chờ health check của service trước khi chạy step đầu tiên. Health check chỉ xác nhận server nhận connection. Nó không xác nhận migration đã chạy hoặc table đã tồn tại. Vì vậy, migration vẫn phải là một step riêng và phải hoàn tất trước test.

<Callout title="Fail fast" type="idea">
  Health check tốt biến lỗi khởi động database thành lỗi rõ ràng ở giai đoạn khởi tạo, thay vì hàng loạt test cùng thất bại với `ECONNREFUSED`.
</Callout>

### Networking runner job và container job

Cách kết nối phụ thuộc vào nơi các step chạy:

| Kiểu job | Nơi chạy step | Hostname PostgreSQL | Khai báo `ports` | URL ví dụ |
|---|---|---|---|---|
| Runner job | Trực tiếp trên VM `ubuntu-latest` | `localhost` hoặc `127.0.0.1` | Bắt buộc map container port ra host | `postgresql://app:pass@localhost:5432/app_test` |
| Container job | Trong container khai báo ở `jobs.<id>.container` | Service label, ví dụ `postgres` | Không cần; các container ở cùng bridge network | `postgresql://app:pass@postgres:5432/app_test` |

Với runner job, `postgres` thường không phải hostname mà step trên VM có thể phân giải. Với container job, `localhost` lại trỏ về chính job container chứ không phải service. Quy tắc ngắn gọn là:

```text
Step chạy trên runner   → localhost + host port đã publish
Step chạy trong container → service label + container port
```

Nếu self-hosted runner có thể chạy nhiều job đồng thời, map cố định `5432:5432` có nguy cơ xung đột. Có thể để GitHub chọn host port trống:

```yaml
services:
  postgres:
    image: postgres:17
    env:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ci-only-password
      POSTGRES_DB: app_test
    ports:
      - 5432

steps:
  - name: Show assigned port
    env:
      POSTGRES_PORT: ${{ job.services.postgres.ports[5432] }}
    run: echo "PostgreSQL is mapped to port ${POSTGRES_PORT}"
```

Khi dùng cách này, tạo `DATABASE_URL` từ `job.services.postgres.ports[5432]` ở step migration và test.

### Secrets và biến môi trường

Credential trong ví dụ chỉ bảo vệ database tạm thời, tồn tại trong job và không truy cập từ Internet. Một mật khẩu cố định như `ci-only-password` có thể đặt trực tiếp trong workflow để fork pull request vẫn chạy được. Nó không phải secret sản xuất.

Dùng GitHub Actions secrets khi workflow kết nối registry riêng hoặc dịch vụ bên ngoài thật. Với secret:

- Chỉ truyền vào đúng step cần dùng qua `env`.
- Không bật shell tracing như `set -x` và không in connection string.
- Không giả định secret có mặt trong pull request từ fork.
- Không đưa production credential vào integration test chạy mã không tin cậy.
- Nếu mật khẩu chứa ký tự đặc biệt, URL-encode nó hoặc dùng các biến `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` riêng.

`env` của service cấu hình quá trình khởi tạo PostgreSQL. `env` của job hoặc step cấu hình ứng dụng test. Hai phía phải dùng cùng user, password và database, nhưng chúng không tự đồng bộ với nhau.

## Bài thực hành Node.js và TypeScript

Ví dụ này dùng `pg` làm PostgreSQL driver và Vitest làm test runner. Repository nhận một SQL client qua tham số. Thiết kế đó cho phép production truyền pool, còn test truyền một connection đang nằm trong transaction.

### Cấu trúc tối thiểu

```text
.
├── .github/
│   └── workflows/
│       └── integration.yml
├── migrations/
│   └── 001_create_users.sql
├── scripts/
│   └── migrate.ts
├── src/
│   ├── db.ts
│   └── users.ts
├── tests/
│   └── integration/
│       └── users.integration.test.ts
├── package-lock.json
├── package.json
└── tsconfig.json
```

### Migration và lớp truy cập dữ liệu

Migration tạo schema mà contract yêu cầu:

```sql title="migrations/001_create_users.sql"
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email)
);
```

Script dưới đây minh họa một migration tối thiểu. Dự án thực tế nên dùng công cụ có bảng lịch sử migration như Prisma Migrate, Drizzle Kit, Knex hoặc node-pg-migrate. Điều quan trọng là local, CI và production chạy cùng một nguồn migration.

```ts title="scripts/migrate.ts"
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const migrationUrl = new URL(
    '../migrations/001_create_users.sql',
    import.meta.url,
  );
  const sql = await readFile(migrationUrl, 'utf8');
  await pool.query(sql);
  console.log('Migration completed');
} finally {
  await pool.end();
}
```

Pool dùng chung cho ứng dụng và test:

```ts title="src/db.ts"
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({ connectionString: databaseUrl });
```

Repository không tự mở connection. Nó nhận một client có method `query`, nên test có thể kiểm soát transaction:

```ts title="src/users.ts"
import type { PoolClient } from 'pg';

type Database = Pick<PoolClient, 'query'>;

export type User = {
  id: string;
  email: string;
  created_at: Date;
};

export async function createUser(
  database: Database,
  email: string,
): Promise<User> {
  const result = await database.query<User>(
    `INSERT INTO users (email)
     VALUES ($1)
     RETURNING id, email, created_at`,
    [email],
  );

  return result.rows[0];
}
```

Giá trị email được truyền bằng parameter `$1`, không nối trực tiếp vào chuỗi SQL. Đây vừa là cách tránh SQL injection, vừa giúp driver xử lý quoting đúng.

### Integration test bằng Vitest

Test đầu tiên kiểm tra đường thành công. Test thứ hai kiểm tra unique constraint thật và SQLSTATE `23505`. Cả hai chạy trong transaction rồi rollback.

```ts title="tests/integration/users.integration.test.ts"
import type { PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/db.js';
import { createUser } from '../../src/users.js';

describe('users repository', () => {
  let client: PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
  });

  beforeEach(async () => {
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  afterAll(async () => {
    client.release();
    await pool.end();
  });

  it('lưu và trả về user mới', async () => {
    const user = await createUser(client, 'new-user@example.com');

    expect(user.id).toBeDefined();
    expect(user.email).toBe('new-user@example.com');
    expect(user.created_at).toBeInstanceOf(Date);

    const stored = await client.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [user.id],
    );
    expect(stored.rows).toEqual([{ email: 'new-user@example.com' }]);
  });

  it('từ chối email trùng bằng unique constraint', async () => {
    await createUser(client, 'duplicate@example.com');

    await expect(
      createUser(client, 'duplicate@example.com'),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
```

Test này không mock `pg`. Nếu migration thiếu unique constraint, trường hợp thứ hai sẽ fail. Nếu query dùng sai tên cột, trường hợp đầu tiên sẽ fail. Đó là giá trị mà unit test với mock không cung cấp.

<Callout title="Transaction bị lỗi" type="warn">
  Sau một câu SQL thất bại, transaction PostgreSQL ở trạng thái aborted cho đến khi `ROLLBACK`. Hook `afterEach` vẫn phải chạy. Đừng tiếp tục gửi query trong cùng test sau khi cố ý tạo lỗi, trừ khi bạn dùng savepoint.
</Callout>

### Scripts và dependencies

Cài các package cần thiết và commit cả `package.json` lẫn `package-lock.json`:

```bash
npm install pg
npm install --save-dev @types/pg tsx typescript vitest
```

Thêm scripts vào `package.json`:

```json title="package.json"
{
  "type": "module",
  "scripts": {
    "db:migrate": "tsx scripts/migrate.ts",
    "test:integration": "vitest run tests/integration"
  }
}
```

`npm ci` trong workflow yêu cầu lockfile đã commit và khớp với `package.json`. Cache của `actions/setup-node` lưu cache tải package của npm, không lưu `node_modules`. Vì vậy, vẫn phải chạy `npm ci` ở mọi job.

Nếu dự án dùng ESM và import TypeScript có hậu tố `.js`, cấu hình TypeScript theo NodeNext:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### Workflow CI hoàn chỉnh

Tạo `.github/workflows/integration.yml` theo mẫu sau. Đây là **runner job**, nên PostgreSQL được publish ra `localhost:5432`.

```yaml title=".github/workflows/integration.yml"
name: Integration tests

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: integration-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  integration:
    name: Node.js and PostgreSQL
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: ci-only-password
          POSTGRES_DB: app_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U app -d app_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://app:ci-only-password@localhost:5432/app_test

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run database migrations
        run: npm run db:migrate

      - name: Run integration tests
        run: npm run test:integration -- --reporter=verbose
```

Tại thời điểm tài liệu được cập nhật, repository chính thức của `actions/checkout` và `actions/setup-node` đều hướng dẫn major `v7`. Node.js `24` là phiên bản được khai báo rõ thay vì phụ thuộc bản cài sẵn trên runner. Image `postgres:17` ghim major để tránh tự động nhảy sang major mới, đồng thời vẫn nhận bản vá của dòng 17.

Để tái lập chặt hơn, có thể ghim action theo full commit SHA và image theo digest. Khi đó, dùng Dependabot hoặc Renovate để tạo pull request cập nhật định kỳ. Major tag dễ đọc hơn; SHA và digest giảm rủi ro thay đổi ngoài ý muốn.

Workflow cố ý chạy migration và test ở hai step riêng. Nếu migration fail, shell trả exit code khác `0`, job dừng và test không chạy trên schema sai.

### Biến thể container job

Nếu job chạy trong `node:24-bookworm`, bỏ port mapping và đổi hostname thành service label `postgres`:

```yaml
jobs:
  integration:
    runs-on: ubuntu-latest
    container: node:24-bookworm
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: ci-only-password
          POSTGRES_DB: app_test
        options: >-
          --health-cmd "pg_isready -U app -d app_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://app:ci-only-password@postgres:5432/app_test
```

Các step còn lại vẫn checkout, `npm ci`, migrate và test như workflow trước. Vì Node.js đã có trong job image, `actions/setup-node` thường không cần thiết. Nếu vẫn dùng action để chọn một bản Node.js khác, hãy bảo đảm image có các công cụ hệ thống action cần.

## Quality gate và cách xác minh

### Điều kiện pass fail

Một integration quality gate chỉ có ý nghĩa khi lỗi thật sự chặn merge. Job phải fail nếu bất kỳ điều kiện nào sau đây không đạt:

- Service PostgreSQL không healthy trong số lần thử cho phép.
- `npm ci` phát hiện lockfile lệch hoặc cài dependency thất bại.
- Migration không áp dụng được lên database trống.
- Bất kỳ integration test nào trả exit code khác `0` hoặc timeout.
- Process test không đóng pool và vượt `timeout-minutes`.

Không đặt `continue-on-error: true` cho migration hoặc integration test. Không bọc lệnh bằng `|| true`. Trong ruleset hoặc branch protection, chọn check `Node.js and PostgreSQL` làm required status check trước khi merge.

Nên giữ quality gate thành một check ổn định. Đổi `job_id` hoặc `name` có thể làm ruleset tiếp tục chờ tên check cũ, nên hãy cập nhật rule cùng lúc khi đổi tên workflow.

### Chạy thử ở máy local

Chạy cùng image, credential và lệnh như CI:

```bash
docker run --detach --rm \
  --name app-test-postgres \
  --publish 5432:5432 \
  --env POSTGRES_USER=app \
  --env POSTGRES_PASSWORD=ci-only-password \
  --env POSTGRES_DB=app_test \
  postgres:17

until docker exec app-test-postgres pg_isready -U app -d app_test; do
  sleep 1
done

export DATABASE_URL='postgresql://app:ci-only-password@localhost:5432/app_test'
npm ci
npm run db:migrate
npm run test:integration -- --reporter=verbose

docker rm --force app-test-postgres
```

Nếu lệnh test fail, vẫn cần xóa container. Trong script dùng thường xuyên, hãy thêm `trap 'docker rm --force app-test-postgres >/dev/null 2>&1 || true' EXIT` ngay sau `docker run` để cleanup luôn chạy.

### Xác minh trên GitHub

Sau khi push workflow, kiểm tra theo thứ tự:

1. Log `Initialize containers` cho thấy image PostgreSQL được pull và health check thành công.
2. Step migration in ra `Migration completed` và kết thúc với exit code `0`.
3. Hai test mẫu đều pass; test unique constraint chứng minh schema thật được áp dụng.
4. Pull request hiển thị required check `Node.js and PostgreSQL`.
5. Tạm thời xóa unique constraint trên một branch thử nghiệm. Test email trùng phải fail. Hoàn tác thay đổi sau khi xác minh.

Quality gate tốt cần một kiểm tra âm tính như bước 5. Nếu cố ý phá contract mà CI vẫn xanh, test đang quan sát sai boundary hoặc workflow không chạy đúng suite.

## Best practices

- **Dùng cùng PostgreSQL major với production.** Khác major có thể che giấu thay đổi về SQL, extension hoặc planner. Nâng major bằng matrix riêng trước khi nâng production.
- **Chạy migration trên database trống.** Điều này bắt lỗi thiếu migration nền. Với hệ thống lâu năm, bổ sung một job khác kiểm tra upgrade từ snapshot schema đã được làm sạch dữ liệu.
- **Ghim dependency có chủ đích.** Commit lockfile, ghim action theo major hoặc SHA, và ghim ít nhất major của PostgreSQL. Không dùng `postgres:latest` trong quality gate quan trọng.
- **Tạo fixture trong test.** Fixture builder nên nhận override để mỗi test chỉ mô tả dữ liệu quan trọng. Tránh một global seed mà mọi test ngầm phụ thuộc.
- **Đóng mọi resource.** `pool.end()`, `server.close()` và timer phải được cleanup trong `afterAll`; nếu không, runner có thể treo dù assertion đã xong.
- **Giữ test xác định.** Cố định timezone, clock hoặc locale khi contract phụ thuộc thời gian. Không dùng `sleep` để chờ dữ liệu nếu có thể poll một điều kiện cụ thể.
- **Không kiểm tra ID tuần tự cố định.** Sequence có thể tăng dù transaction rollback. Hãy kiểm tra tính duy nhất và quan hệ thay vì một con số cụ thể.
- **Không log credential.** Log host, port, database và trạng thái kết nối là đủ. Không in toàn bộ `DATABASE_URL` khi URL chứa secret thật.
- **Tách integration suite.** Dùng script `test:integration` riêng để branch protection và developer biết chính xác suite nào đang chạy.
- **Ưu tiên lỗi có ngữ cảnh.** Khi setup fail, in trạng thái container và migration hiện tại. Khi query fail, log tên scenario, không log dữ liệu nhạy cảm.
- **Không retry assertion một cách mù quáng.** Retry có thể che flaky test do isolation sai. Chỉ retry thao tác thực sự bất đồng bộ và ghi nhận nguyên nhân.

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `connect ECONNREFUSED 127.0.0.1:5432` | Thiếu port mapping, health check chưa đủ hoặc service không khởi động | Với runner job, thêm `ports: - 5432:5432`; kiểm tra log `Initialize containers` và tăng health retries nếu startup hợp lệ nhưng chậm |
| `getaddrinfo ENOTFOUND postgres` | Runner job dùng hostname của container network | Dùng `localhost` trên runner job; chỉ dùng `postgres` khi job có `container:` |
| Kết nối `localhost` fail trong container job | `localhost` là chính job container | Đổi host thành service label `postgres` và bỏ host port mapping |
| `password authentication failed for user` | `POSTGRES_USER`, `POSTGRES_PASSWORD` và URL không khớp; mật khẩu trong URL chưa encode | Đồng bộ env hai phía hoặc dùng các biến `PG*` riêng; tạo service mới sau khi đổi giá trị khởi tạo |
| `database "app_test" does not exist` | `POSTGRES_DB` khác database trong URL | Đặt cùng tên ở service env và `DATABASE_URL`; kiểm tra typo và chữ hoa chữ thường |
| `relation "users" does not exist` | Test chạy trước migration hoặc migration nối nhầm database/schema | Giữ migration trước test, in `current_database()` và `current_schema()` khi chẩn đoán |
| Test pass riêng nhưng fail khi chạy cả suite | Fixture trùng, cleanup thiếu hoặc nhiều worker sửa cùng row | Dùng dữ liệu duy nhất, rollback đúng connection, schema theo worker hoặc tạm đặt `--maxWorkers=1` để xác nhận nguyên nhân |
| Test treo sau khi đã in kết quả | Pool, server, timer hoặc subscription chưa đóng | Gọi `client.release()` và `pool.end()` trong `afterAll`; dùng `--reporter=verbose` và Vitest handle diagnostics nếu cần |
| `current transaction is aborted` | Một statement trước đó đã fail trong transaction | `ROLLBACK` trước khi gửi query tiếp; dùng savepoint nếu test cần quan sát nhiều lỗi trong một transaction |
| `port is already allocated` trên self-hosted runner | Nhiều job cùng map host port `5432` | Chỉ khai báo `- 5432`, rồi đọc `${{ job.services.postgres.ports[5432] }}` để dùng port động |
| Migration deadlock hoặc báo object đã tồn tại | Nhiều worker/job dùng chung external database | Mỗi job dùng service riêng; chạy migration một lần trước suite; không chạy DDL trong test song song |
| Cache hit nhưng `npm ci` vẫn chạy | `setup-node` cache npm download cache, không cache `node_modules` | Đây là hành vi đúng; giữ `npm ci` để cài chính xác theo lockfile |
| Service bị `unhealthy` | Health command sai user/database hoặc PostgreSQL startup lỗi | Chạy đúng `pg_isready -U app -d app_test`; xem service logs và kiểm tra biến khởi tạo trước khi chỉ tăng retries |

Khi cần thêm log chẩn đoán tạm thời cho runner job, thêm step chỉ chạy lúc thất bại:

```yaml
- name: Diagnose PostgreSQL
  if: failure()
  run: |
    docker ps --all
    container_id="$(docker ps --all --quiet --filter ancestor=postgres:17 | head -n 1)"
    if [ -n "$container_id" ]; then
      docker logs "$container_id"
    fi
```

Không giữ bước log toàn bộ môi trường hoặc connection string trong workflow, vì log có thể làm lộ secret.

## Tài liệu tham khảo

- [GitHub Docs — Creating PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
- [GitHub Docs — Communicating with Docker service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers)
- [GitHub Docs — Workflow syntax for service containers](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idservices)
- [actions/checkout — hướng dẫn phiên bản và usage chính thức](https://github.com/actions/checkout)
- [actions/setup-node — Node.js setup và npm cache](https://github.com/actions/setup-node)
- [Docker Official Image — PostgreSQL](https://hub.docker.com/_/postgres)
- [PostgreSQL — `pg_isready`](https://www.postgresql.org/docs/current/app-pg-isready.html)
- [PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Vitest — Test lifecycle hooks](https://vitest.dev/api/#beforeeach)
- [node-postgres — Pooling](https://node-postgres.com/features/pooling)

## Các bài tiếp theo

<Cards>
  <Card title="Unit testing" href="/docs/kiem-thu-chat-luong/01-unit-testing/" description="Tách logic thuần và xây dựng phản hồi nhanh trước integration test." />
  <Card title="End-to-end testing" href="/docs/kiem-thu-chat-luong/03-end-to-end-testing/" description="Mở rộng kiểm thử đến luồng người dùng và hệ thống đang chạy." />
  <Card title="Test reports và annotations" href="/docs/kiem-thu-chat-luong/07-test-reports-annotations/" description="Đưa kết quả kiểm thử lên pull request bằng report và annotation." />
</Cards>
