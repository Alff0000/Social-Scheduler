import { listTags, listTopicTagsWithUsage } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { TagManager } from "@/components/tag-manager";

export const dynamic = "force-dynamic";

export default function TagsPage() {
  const topicTags = listTopicTagsWithUsage();
  const bandTags = listTags("time_of_day");
  // The picker orders the bands this way too — alphabetical would read as arbitrary.
  const bandOrder = ["morning", "afternoon", "evening", "anytime"];
  const bands = [...bandTags].sort(
    (a, b) => bandOrder.indexOf(a.name) - bandOrder.indexOf(b.name)
  );

  return (
    <div>
      <PageHeader
        title="Etiquetas"
        subtitle="Todos os rótulos desta instalação. Renomeie um tópico para corrigir em todo lugar, ou exclua para tirá-lo das publicações que o carregam — as publicações continuam existindo de qualquer forma."
      />
      <div className="px-8 py-6">
        <TagManager topicTags={topicTags} bandTags={bands} />
      </div>
    </div>
  );
}
