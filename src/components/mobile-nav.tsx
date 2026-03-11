"use client";

import { useState } from "react";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

type Props = {
  userName: string;
  userRole: string;
  isAdmin: boolean;
};

export function MobileNav({ userName, userRole, isAdmin }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ハンバーガーボタン (md以下で表示) */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden p-2 text-gray-600 hover:text-gray-900"
        aria-label="メニュー"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* モバイルメニュー */}
      {open && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-50">
          <div className="px-4 py-3 space-y-3">
            <Link
              href="/customers"
              onClick={() => setOpen(false)}
              className="block text-sm text-gray-700 hover:text-blue-600 py-2"
            >
              顧客一覧
            </Link>
            {isAdmin && (
              <Link
                href="/admin/users"
                onClick={() => setOpen(false)}
                className="block text-sm text-gray-700 hover:text-blue-600 py-2"
              >
                ユーザー管理
              </Link>
            )}
            <hr className="border-gray-200" />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">
                {userName}
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                  {userRole === "admin" ? "管理者" : "営業"}
                </span>
              </span>
              <SignOutButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
