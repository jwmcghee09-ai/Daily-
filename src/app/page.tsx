import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import LandingPage from "@/components/marketing/landing-page";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home(props: { searchParams: SearchParams }) {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/dashboard?mode=account");
  }

  const searchParams = await props.searchParams;
  const checkout = readSingleParam(searchParams.checkout);
  const plan = readSingleParam(searchParams.plan);

  return (
    <LandingPage
      checkoutState={checkout === "success" || checkout === "cancelled" ? checkout : null}
      checkoutPlan={plan === "pro" ? "pro" : plan === "plus" ? "plus" : "free"}
    />
  );
}

function readSingleParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? null;
  }

  return null;
}
