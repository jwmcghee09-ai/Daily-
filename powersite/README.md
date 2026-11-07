# PowerSite

A marketplace matching NSW owners of spare space that already has a power connection
(carparks, yards, depots, rooftops, empty buildings, land near substations) with people
installing container data centres, batteries, EV charging and telco gear. Focus: 50 kVA to 10 MW.

Pages: `/` home, `/spaces` example listings, `/edge-data-centres`, `/how-it-works`, `/pricing`, `/get-started` sign-up forms.

## Going live

1. **Turn on the forms.** Make a free form at [formspree.io](https://formspree.io), copy its endpoint
   (`https://formspree.io/f/xxxxxxx`) and set it as `VITE_FORM_ENDPOINT` (see `.env.example`, or the
   environment settings of wherever you host it). Without it, the forms are switched off and say
   "Enquiries open soon." Sign-ups arrive in your Formspree inbox and by email.
2. **Publish.** In Lovable: Publish, then Settings → Domains to connect your domain. Or build it
   yourself with `bun install && bun run build` and deploy `.output` to Cloudflare (`npx nitro deploy --prebuilt`).
3. **Before launch:** swap the example listings in `src/content/fragments.ts` (`SPACES` in `listingsJs`)
   for real ones, and re-check the market figures against their sources.

# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
