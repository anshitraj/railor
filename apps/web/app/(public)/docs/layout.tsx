import { getSession } from "../../../lib/auth";
import { getOrgTestKey } from "../../../lib/org";
import { DocsKeyCard } from "../../../components/docs/docs-key-card";
import { DocsPager } from "../../../components/docs/docs-pager";
import { DocsSidebar } from "../../../components/docs/docs-sidebar";
import { DocsToc } from "../../../components/docs/docs-toc";

export const dynamic = "force-dynamic";

const ARTICLE_ID = "docs-article";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const key = session?.organization ? await getOrgTestKey(session.organization.id) : null;

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-7 lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[13.5rem_minmax(0,1fr)_11.5rem]">
      <DocsSidebar>
        <DocsKeyCard apiKey={key} />
      </DocsSidebar>

      <div className="flex min-w-0 flex-col gap-12">
        {/* .docs-prose (globals.css) gives every docs page its h2 face and inline-code chips. */}
        <article id={ARTICLE_ID} className="docs-prose flex max-w-3xl flex-col gap-9">
          {children}
        </article>
        <DocsPager />
      </div>

      <DocsToc articleId={ARTICLE_ID} />
    </div>
  );
}
