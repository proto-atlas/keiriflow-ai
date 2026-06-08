# Lighthouse計測記録

生成日時: 2026-05-08 05:48 +09:00
公開URL: https://keiriflow-ai.atlas-lab.workers.dev
計測対象URL: https://keiriflow-ai.atlas-lab.workers.dev/dashboard
確認種別: Lighthouse lab測定

## 日本語要約

このevidenceは、公開URLに対するLighthouse lab測定の特定時点ログです。

- 確認したこと: 公開URLのdashboard表示に対するLighthouse mobile / desktop lab score
- 結果: mobileはPerformance 82 / Accessibility 100 / Best Practices 100 / SEO 100、desktopはPerformance 97 / Accessibility 100 / Best Practices 100 / SEO 100
- 読み方: mobile Performanceは改善余地がありますが、公開URLの確認結果としてアクセシビリティ、基本品質、SEOの主要チェックは良好です
- この記録に含めない範囲: field Core Web Vitals、本番負荷下の性能、全画面の性能、継続的な性能保証

詳細なLighthouse項目名、CLI command、metric名は、証拠性と再現性を保つため原文のまま残しています。

## 確認環境

- tool: Lighthouse 13.3.0
- 使用browser: HeadlessChrome 148.0.0.0
- 実行環境: local lab measurement
- 出力: JSON reportを生成し、summary化しました

Lighthouse CLIはJSON reportを書き出した後、local browser profile cleanupの失敗によりnon-zero exitを返しました。以下のscoreは生成済みJSON reportから抽出しています。

## スコア

| Preset | Performance | Accessibility | Best Practices | SEO |
|---|---:|---:|---:|---:|
| mobile | 82 | 100 | 100 | 100 |
| desktop | 97 | 100 | 100 | 100 |

## 主な指標

| Preset | FCP | LCP | TBT | CLS | Speed Index |
|---|---:|---:|---:|---:|---:|
| mobile | 1.9 s | 2.5 s | 330 ms | 0 | 7.4 s |
| desktop | 0.6 s | 0.6 s | 30 ms | 0 | 1.6 s |

## 実行コマンド

```bash
CHROME_PATH="<local Chrome executable>" corepack pnpm dlx lighthouse@latest https://keiriflow-ai.atlas-lab.workers.dev --output=json --only-categories=performance,accessibility,best-practices,seo --chrome-flags="--headless=new --no-sandbox --disable-gpu"
CHROME_PATH="<local Chrome executable>" corepack pnpm dlx lighthouse@latest https://keiriflow-ai.atlas-lab.workers.dev --preset=desktop --output=json --only-categories=performance,accessibility,best-practices,seo --chrome-flags="--headless=new --no-sandbox --disable-gpu"
```

## この記録に含めない範囲

- field Core Web Vitalsではありません。
- load testではありません。
- すべてのrouteで同じscoreになることを証明するものではありません。
- 認証付き、または確認用キーで制限したworkflow下の性能を証明するものではありません。
- 継続的なperformance regression保護を証明するものではありません。
