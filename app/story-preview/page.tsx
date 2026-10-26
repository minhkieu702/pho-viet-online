// Localhost-only preview of the story UI with mock data: /story-preview?c=<scene>&chrome=0&touch=1.
// Any other host (the deployed site) gets a 404, so the gallery and its mock text never ship as a page.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import StoryPreview from '../story-ui/StoryPreview';
import { SCENES, type SceneId } from '../story-ui/mock';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Story UI — xem thử', robots: { index: false, follow: false } };

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StoryPreviewPage({ searchParams }: { searchParams: Promise<Search> }) {
  const h = await headers();
  // Every listed host must be local: a proxy appends to X-Forwarded-Host, so a forged first entry proves nothing.
  const hosts = [h.get('host'), h.get('x-forwarded-host')].filter((v): v is string => !!v).flatMap((v) => v.split(',').map((s) => s.trim()));
  for (const m of (h.get('forwarded') ?? '').matchAll(/host="?([^;,"\s]+)/gi)) hosts.push(m[1]);
  if (!hosts.length || !hosts.every((v) => LOCAL_HOST.test(v))) notFound();
  const q = await searchParams, c = one(q.c);
  const initial: SceneId = SCENES.some((s) => s.id === c) ? (c as SceneId) : 'hud';
  return <StoryPreview initial={initial} chrome={one(q.chrome) !== '0'} touch={one(q.touch) === '1'} />;
}
