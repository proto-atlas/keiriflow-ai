# 検証記録の一覧

KeiriFlow AIの検証記録をまとめます。各記録は、その時点の構成と合成データに対する確認結果です。継続的な性能保証、税務判断の正確性、AI抽出精度の一般品質を示すものではありません。

## 公開URL

- [外部サービス接続の確認](external-service-check-2026-05-08.md): Cloudflare Workers上の確認用構成で、Supabase保存、確認用キー制限、AI抽出、仕訳候補生成、承認、CSV出力を最小件数で確認。
- [Lighthouse計測](lighthouse-2026-05-08.md): 公開URLのdashboardに対するLighthouse lab測定。

## READMEで参照している結果

| 対象 | 結果 | 補足 |
|---|---|---|
| lint | 通過 | GitHub CIで確認 |
| typecheck | 通過 | GitHub CIで確認 |
| Vitest | 19 files / 118 tests通過 | 業務ルール、API境界、provider境界、確認用キー制限 |
| build | 通過 | GitHub CIで確認 |
| Cloudflare build / deploy | 通過 | Worker Version IDは外部サービス接続の記録を参照 |
| Lighthouse mobile | 82 / 100 / 100 / 100 | Performance / Accessibility / Best Practices / SEO |
| Lighthouse desktop | 97 / 100 / 100 / 100 | Performance / Accessibility / Best Practices / SEO |

## 壊れやすいケースと扱い

| ケース | 実装上の扱い | 見える結果 |
|---|---|---|
| 確認用キーなしで変更系APIを呼ぶ | 変更、AI抽出、CSV出力を確認用キーで制限する | 読み取り画面だけ確認できる |
| AIが不完全な候補を返す | Zod検証と業務ルールで候補を確認する | 人が修正・承認してから状態を進める |
| Supabase環境変数がない | モックrepositoryへ切り替える | localでも固定データで画面を確認できる |
| 承認前にCSV出力しようとする | 状態遷移ルールで抑える | 承認済みのデータだけCSV対象になる |
| 合成データ以外の証憑が投入される | UIで機密情報・個人情報を含むファイルを登録しない前提を表示する | 公開URLで扱うデータ範囲が分かる |

## この記録で確認していないこと

- 本番認証やユーザー別権限管理
- 負荷テストや長時間稼働
- 税務判断や会計判断の正確性
- AI抽出精度の一般品質
- field Core Web Vitals
- すべての画面で同じLighthouseスコアになること
