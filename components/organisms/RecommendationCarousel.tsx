import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import * as Haptics from 'expo-haptics';
import '@/components/recommendations/definitions';
import { resolveRecommendation } from '@/components/recommendations/registry';
import { CARD_WIDTH, RecommendationCard } from '@/components/recommendations/RecommendationCard';
import type { Recommendation } from '@/types/conversation';

const GAP = 10;

type Props = {
  recommendations: Recommendation[] | null | undefined;
  persona:         string;
};

/**
 * Horizontal, snap-scrolling row of recommendation cards under an AI
 * message. Knows nothing about individual types — every card is resolved
 * through the registry (unknown types → fallback card).
 */
function RecommendationCarouselImpl({ recommendations, persona }: Props) {
  const renderItem: ListRenderItem<Recommendation> = useCallback(({ item }) => {
    const def = resolveRecommendation(item.type);
    const Card = def.Card ?? RecommendationCard;
    const onPress = () => {
      Haptics.selectionAsync().catch(() => {});
      try {
        def.onPress(item, { persona });
      } catch (err) {
        console.warn('[recommendations] handler failed:', err);
      }
    };
    return <Card recommendation={item} definition={def} onPress={onPress} />;
  }, [persona]);

  if (!recommendations || recommendations.length === 0) return null;

  return (
    <FlatList
      horizontal
      data={recommendations}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
      snapToInterval={CARD_WIDTH + GAP}
      decelerationRate="fast"
      // Short lists — render them all, no virtualization churn.
      initialNumToRender={recommendations.length}
      nestedScrollEnabled
      style={styles.list}
    />
  );
}

const keyExtractor = (r: Recommendation) => r.id;
const Separator = () => <View style={{ width: GAP }} />;

export const RecommendationCarousel = memo(RecommendationCarouselImpl);

const styles = StyleSheet.create({
  // Bleed to the screen edge so cards scroll under the list padding.
  list:    { marginHorizontal: -16, marginTop: 8, marginBottom: 2 },
  content: { paddingHorizontal: 16 },
});
