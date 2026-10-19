import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING } from '../../../constants/theme';
import { getCategoryById, getArticlesByCategory } from '../../../data/helpData';

export default function HelpCategoryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const category = getCategoryById(id);
  const articles = getArticlesByCategory(id);

  if (!category) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
          </Pressable>
          <Text style={s.headerTitle}>AJUDA</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.emptyState}>
          <Text style={s.emptyText}>Categoria não encontrada.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header minimalista com seta menor */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
        </Pressable>

        <Text style={s.headerTitle}>AJUDA</Text>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.categoryHeading}>{category.title}</Text>
        {category.subtitle ? <Text style={s.categorySub}>{category.subtitle}</Text> : null}

        {/* Lista minimalista sem box/card com borda */}
        <View style={s.articleListContainer}>
          {articles.map((item, index) => (
            <View key={item.id}>
              <Pressable
                style={s.articleRow}
                onPress={() => router.push(`/ajuda/artigo/${item.id}`)}
              >
                <Text style={s.articleTitle}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={14} color="#C2C2C2" />
              </Pressable>
              {index < articles.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  content: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[5],
    paddingBottom: SPACING[10],
  },
  categoryHeading: {
    fontSize: TYPOGRAPHY.sizes.xl,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
    marginBottom: SPACING[1],
  },
  categorySub: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING[6],
  },
  articleListContainer: {
    backgroundColor: '#FFFFFF',
  },
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING[4],
    backgroundColor: '#FFFFFF',
  },
  articleTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.text,
    paddingRight: SPACING[2],
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F2',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.sm,
  },
});
