import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: HomeProps) {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/dashboard?mode=account");
  }

  const resolved = searchParams ? await searchParams : {};
  const nextQuery = new URLSearchParams();

  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string") {
      nextQuery.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        nextQuery.append(key, item);
      }
    }
  }

  const queryString = nextQuery.toString();
  redirect(queryString ? `/spectre-landing.html?${queryString}` : "/spectre-landing.html");
}