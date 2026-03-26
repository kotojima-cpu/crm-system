/**
 * 郵便番号→住所検索 API
 *
 * 外部 API (zipcloud) を使い、郵便番号から住所を取得する。
 * 認証不要（ログイン画面等からも使える可能性を考慮）だが、
 * 基本的にはログイン済みユーザーが顧客登録/編集時に使う。
 */
import { NextRequest, NextResponse } from "next/server";

const ZIPCLOUD_URL = "https://zipcloud.ibsnet.co.jp/api/search";

export async function GET(request: NextRequest) {
  const zipCode = request.nextUrl.searchParams.get("zipCode");

  if (!zipCode) {
    return NextResponse.json(
      { error: { message: "郵便番号を指定してください" } },
      { status: 400 },
    );
  }

  // ハイフン除去して7桁に正規化
  const normalized = zipCode.replace(/-/g, "");
  if (!/^\d{7}$/.test(normalized)) {
    return NextResponse.json(
      { error: { message: "郵便番号の形式が不正です（7桁の数字で指定してください）" } },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${ZIPCLOUD_URL}?zipcode=${normalized}`, {
      next: { revalidate: 86400 }, // 24時間キャッシュ
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: { message: "住所検索サービスへの接続に失敗しました" } },
        { status: 502 },
      );
    }

    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return NextResponse.json({
        data: { results: [] },
      });
    }

    // zipcloud の応答を整形
    const results = data.results.map((r: { address1: string; address2: string; address3: string; zipcode: string }) => ({
      zipCode: r.zipcode,
      prefecture: r.address1,
      city: r.address2,
      town: r.address3, // 町域
    }));

    return NextResponse.json({ data: { results } });
  } catch {
    return NextResponse.json(
      { error: { message: "住所検索中にエラーが発生しました" } },
      { status: 500 },
    );
  }
}
