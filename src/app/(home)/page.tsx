import Link from 'next/link';
import { ArrowRight, BookOpen, GitBranch, Workflow } from 'lucide-react';

const highlights = [
  { icon: BookOpen, label: '105 tài liệu', detail: 'Từ nền tảng đến production' },
  { icon: GitBranch, label: '13 chủ đề', detail: 'Theo lộ trình học tập rõ ràng' },
  { icon: Workflow, label: 'Thực hành', detail: 'Có sẵn khung bài tập và runbook' },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-20">
      <div className="max-w-3xl">
        <p className="mb-4 font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">
          TÀI LIỆU TIẾNG VIỆT
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Học GitHub Actions có hệ thống</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-fd-muted-foreground">
          Bộ khung tài liệu toàn diện về workflow, runners, CI/CD, bảo mật và vận hành GitHub Actions.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/docs/bat-dau/01-tong-quan-github-actions/"
            className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-3 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Bắt đầu học <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/docs/bat-dau/04-lo-trinh-hoc-tap/"
            className="rounded-lg border border-fd-border px-5 py-3 font-medium hover:bg-fd-accent"
          >
            Xem lộ trình
          </Link>
        </div>
      </div>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {highlights.map(({ icon: Icon, label, detail }) => (
          <div key={label} className="rounded-xl border border-fd-border bg-fd-card p-5">
            <Icon className="mb-4 size-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-semibold">{label}</h2>
            <p className="mt-1 text-sm text-fd-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
