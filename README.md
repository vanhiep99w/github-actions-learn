# GitHub Actions Learning

Tài liệu học GitHub Actions bằng tiếng Việt, được tổ chức theo lộ trình từ nền tảng đến CI/CD production.

Project hiện cung cấp **105 trang khung** thuộc **13 chủ đề**. Mỗi trang đã có frontmatter, mục lục, outline theo chủ đề, khung bài thực hành, Best Practices, Troubleshooting và tài liệu tham khảo để tiếp tục bổ sung nội dung chi tiết.

## Tech stack

- Next.js 16
- React 19
- Fumadocs 16 + Fumadocs MDX 15
- Tailwind CSS 4
- Mermaid 11
- Cloudflare Pages

## Cấu trúc nội dung

| Thứ tự | Chủ đề | Số trang |
|--------|--------|---------:|
| 1 | Bắt đầu | 4 |
| 2 | Nền tảng | 10 |
| 3 | Điều khiển workflow | 10 |
| 4 | Tái sử dụng và custom actions | 7 |
| 5 | Runners | 7 |
| 6 | Continuous Integration | 8 |
| 7 | Kiểm thử và chất lượng | 7 |
| 8 | Continuous Delivery và Deployment | 9 |
| 9 | Bảo mật | 9 |
| 10 | Vận hành và tối ưu | 8 |
| 11 | Chủ đề nâng cao | 9 |
| 12 | Công thức thực hành | 8 |
| 13 | Tham chiếu | 9 |

Toàn bộ nội dung nằm trong [`content/docs/`](content/docs/). Thứ tự sidebar được quản lý bởi file `meta.json` ở root và trong từng category.

## Chạy local

Yêu cầu Node.js 20.9 trở lên.

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Kiểm tra project

```bash
npm run types:check
npm run lint
npm run build
```

Static site sau khi build nằm trong thư mục `out/`.

## Deploy Cloudflare Pages

### Deploy bằng Wrangler

```bash
npx wrangler login
npm run deploy
```

### Deploy tự động từ GitHub

Cấu hình Cloudflare Pages với:

| Cấu hình | Giá trị |
|----------|---------|
| Build command | `npm run build` |
| Build output directory | `out` |
| Node.js version | `20.9` trở lên |

## Cập nhật tài liệu

1. Chọn file trong `content/docs/{category}/`.
2. Thay các đoạn `Placeholder` bằng nội dung thực tế.
3. Bổ sung workflow mẫu với code block `yaml`.
4. Bổ sung diagram bằng Mermaid khi cần.
5. Kiểm tra liên kết nội bộ có trailing slash.
6. Nếu thêm trang mới, đăng ký slug trong `meta.json` của category.
7. Chạy đầy đủ type check, lint và build trước khi commit.
