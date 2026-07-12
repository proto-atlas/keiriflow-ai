# Design Decisions

この文書は、KeiriFlow AIの主要な設計判断と、その理由をまとめます。

## 1. AIは確定処理ではなく候補生成に限定する

会計・経理領域では、AIの誤りがそのまま処理ミスにつながる可能性があります。そのため、KeiriFlow AIではAIを「確定処理」ではなく「候補生成」として扱います。

実装上も、抽出結果と仕訳候補はフォームで修正でき、承認ステータスと監査ログを通して人間の判断を残す設計にしています。

## 2. UI routeはinvoices、内部モデルはdocumentsにする

画面上は業務対象が伝わりやすい `/invoices` を使います。一方で、内部モデルとAPIは `documents` にしています。

理由は、請求書だけでなく領収書も扱うためです。UIは分かりやすさ、内部モデルは拡張性を優先しています。

## 3. モック動作を標準にする

環境変数が未設定の場合、repositoryはmock data、AI providerはmock providerに戻ります。

この設計にした理由は、外部サービスの設定がない状態でも、UI、API、validation、監査ログ、承認フローを確認できるようにするためです。

ただし、モック動作は本番データ保存を証明するものではありません。実Supabase接続は別途確認が必要です。

mock repositoryのアップロード済み証憑は、プロセスメモリ上のデモ状態です。Cloudflare Workersなどの実行環境ではisolateの再起動で消える可能性があるため、永続保存はSupabase modeで確認する前提です。

mock repositoryでは、新規アップロードを `mockUploadedDocuments`、シードデータへの変更を `mockDocumentOverrides` に分けて保持します。シードデータを直接変更しないことで、初期データの読みやすさとテストごとのreset境界を保つ判断です。

## 4. Supabaseはserver-side repository経由で扱う

`SUPABASE_SERVICE_ROLE_KEY` はserver-side Route Handlerだけで使い、ブラウザへ渡しません。

UIから直接Supabaseを触るのではなく、Route Handlerとrepositoryを挟むことで、将来的な権限管理、監査ログ、validation、保存先切り替えを一箇所に集めやすくしています。

証憑登録APIは、Storage upload、documents insert、audit log insert、policy warning sync、再取得を分けて実行します。最小実装では整合性と読みやすさを優先し、round trip数の最小化は主張範囲に含めていません。

Supabase modeの証憑登録は複数操作を順に実行するため、途中失敗時にはStorage objectやdocuments rowが残り得ます。現時点ではrollback / compensationを実装せず、診断時に手動で残骸を削除する前提です。

## 5. 公開URLの変更系APIは利用量制限を通す

このアプリでは、証憑登録、更新、AI候補生成、承認、CSV出力のrouteに `x-keiriflow-demo-key` を要求します。

このkeyは本番向けのユーザー認証ではありません。確認用デモで、無関係な連打や負荷テストによる外部API / DB利用を抑えるための利用量制限です。

keyが一致した場合だけ、確認用キーとクライアントIPをSHA-256 hash化して `demo_usage_events` に記録します。raw確認用キーとraw IPは保存しません。記録したhashを使い、route groupごとの短時間rate limitと、AI系routeの日次上限を判定します。

外部接続モードで 確認用キーまたはrate limit storeが使えない場合は、制限対象routeをfail-closedにします。rate limitは 確認用キー / IP単位の短時間windowと、確認用キー単位・UTC基準のAI系route日次上限を組み合わせた利用量制限 です。`AI_PROVIDER_MODE=anthropic` でprovider configが不足する場合も、mock providerに戻さずfail-closedにします。

読み取り画面と `GET /api/documents` / `GET /api/documents/[id]` は、合成データを確認するためのopen readとして残します。実データやユーザー別データを扱う本番化では、ここも認証・認可の対象にします。

本番化する場合は、Cloudflare Access、Supabase Auth、tenant分離、per-user quota、監査可能な権限モデルを別途設計する前提です。

## 6. AI providerはSDKではなくdirect fetch境界にする

Anthropic Messages APIへの接続は、server-side provider内のdirect fetchに閉じ込めています。

理由は、API key、headers、max tokens、tool schema、error handlingを明示的に管理し、UIやrepositoryへproviderの詳細を漏らさないためです。

AI抽出では、Supabase Storageから取得したPDF / PNG / JPEGをserver-sideでbase64 化し、Anthropic Messages APIの `document` / `image` content blockとして送ります。公式docsではPDF/画像blockをtextより前に置く構成が示されているため、file block、text blockの順にしています。

現在の構成のlive AI抽出は、主要ヘッダー項目と `confidenceScore` を保存対象にします。明細行の永続化と明細単位のUIは今後の対応範囲とし、provider schemaでも要求しません。

provider callには `ANTHROPIC_TIMEOUT_MS` を設け、長時間応答がない場合は `provider_timeout` として扱います。timeoutやprovider errorの詳細、raw response、API keyはUIへ返しません。

API responseの `mode` / `repositoryMode` は、確認用デモでmock / Supabase / Anthropicの境界を確認しやすくするための可視化用fieldです。本番認証を持つproduction APIにする場合は、レスポンスから外す候補として扱います。

tool定義の `strict: true` は、AnthropicのStrict tool use公式ドキュメントで示されるtool定義トップレベルのoptionとして扱っています。

参考: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
参考: https://platform.claude.com/docs/en/build-with-claude/pdf-support
参考: https://platform.claude.com/docs/en/build-with-claude/vision

## 7. AI出力はZod validationを通す

AI providerの出力は、`src/lib/ai/schemas.ts` のZod schemaで検証します。

validationに失敗した場合は保存しません。provider responseの生データもUIへ返しません。AIの出力形式がずれた場合に、業務データへそのまま混ざらないようにするためです。

## 8. 警告はルールベースで生成する

警告はAIではなく、明示的なルールで生成します。

現在の警告は以下です。

- 10万円以上の高額支出
- インボイス登録番号未確認
- 抽出信頼度低
- 重複候補
- 小計 + 消費税額 と合計金額の不一致

警告は法的判定ではなく、担当者に確認を促す業務上の注意として扱います。

mock modeとSupabase modeで同じルールを使うため、Supabase接続時も証憑作成・更新時に警告を同期する方針にしています。

Supabase modeの警告同期はupsertと不要警告のdeleteを組み合わせます。D1 のような単一transaction内処理ではなく、Supabaseへの複数操作なので、完全な原子性ではなく最終的な整合を狙う境界として扱います。

## 9. CSV出力GETは副作用を持たせない

CSVは `GET /api/documents/export.csv` で出力しますが、このGETでは証憑ステータスを変更しません。

CSV出力済みステータスへの変更は、詳細画面のステータス更新で行います。ダウンロードの再試行やプレビューで意図せず状態が変わることを避けるためです。

CSVセルは、表計算ソフトが数式として評価する可能性がある先頭文字を無害化します。会計データは人間がExcelで開く可能性が高いため、CSV injectionを出力境界で防ぐ判断です。

## 10. アップロード検証は軽量な境界に留める

アップロード時は、ファイルサイズ、拡張子、ブラウザから渡されるMIME typeを検証します。確認用デモでは、一般的な誤操作を止める境界として扱い、ファイル内容のmagic byte検証やウイルススキャンは主張しません。

## 11. テストは業務ルールと境界を優先する

テストの目的は、業務ルールの正しさを確認することと、API / provider境界の異常系を文書化することです。

層は次のように分けています。

- 単体: 金額、警告、状態遷移、CSV、upload validation、date filter、storage key
- Route Handler: 一覧取得、証憑更新、アップロード、承認応答の `200 / 400 / 404 / 409`
- Provider境界: Anthropic HTTP error、tool_use欠落、Zod schema違反
- 相互作用: 複数アップロード時の重複候補、警告ステータス保持、監査ログ累積

現在のテストでは、以下を重点的に確認しています。

- 金額表示
- ダッシュボード集計
- ステータス遷移
- 警告生成
- CSV生成
- ファイルアップロード検証
- 日付フィルタ検証
- storage key生成
- mock repository fallback
- 仕訳候補更新
- 警告更新
- 承認依頼 / 承認応答
- AI provider fallback
- Anthropic tool response parsing / provider error handling
- Anthropic providerのPDF / image content block生成
- 確認用キー制限
- 確認用キー / IP単位のrate limit
- AI系routeの日次上限

主要画面がエラー画面にならないことはPlaywrightで確認します。証憑登録から承認、CSV出力までの一連操作を通したE2Eは、今後の確認事項として残しています。Supabase接続、公開URLでの主要API接続、Anthropic provider経路は、Cloudflare上の確認用構成で最小件数を確認しています。APIを直接叩いた場合も、確定済み証憑の内容更新、承認依頼、承認応答はconflict errorを `409` にマップします。監査ログの `actorName` は現在の構成では固定値で、本番Auth連携時に実ユーザー名へ置き換える前提です。現時点では、このリポジトリの主張範囲に合わせて、業務ルールとserver-side境界のテストを優先しています。

## 12. Cloudflare Workers + OpenNextを公開先にする

公開URLはCloudflare Workers + OpenNext adapterで構成します。

このアプリはRoute Handlerを含むfull-stack Next.jsアプリなので、静的hostingだけではAPI routeをそのまま見せられません。Cloudflare上では、Workers runtimeでNext.jsのserver-side routeを動かす構成を検証対象にします。

Linux CI上の `pnpm cf:build` とCloudflare production envへのdeployは確認済みです。公開URLでは、確認用キー付きの証憑登録、更新、承認、CSV出力、Supabase保存、Anthropic provider経路を最小件数で確認しています。

## 13. 主張範囲を狭く保つ

このリポジトリで主張するのは、会計AIワークフローのUI / API / validation / audit / provider boundaryを設計・実装できることです。

一方で、以下は主張しません。

- 実運用向け会計ソフト
- 税務判断の正確性
- 電子帳簿保存法やインボイス制度への完全対応
- 特定会計ソフトとの完全互換CSV
- AI抽出精度の完全性
- 本番向けの認証・権限管理
- アップロードファイル内容の完全な真正性検証
