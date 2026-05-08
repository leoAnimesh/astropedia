import { StyleSheet, Text, View } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { FONTS } from '@/constants/themes';
import { DotsLoader } from './DotsLoader';

type Props = {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  streamText?: string;
};

export function ChatBubble({ role, content, isStreaming, streamText }: Props) {
  const { theme } = useAccent();
  const isUser = role === 'user';

  const displayText = isStreaming ? streamText ?? '' : content;
  const isEmpty = !displayText && isStreaming;

  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAI]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: theme.ink }]
            : [styles.bubbleAI,   { backgroundColor: theme.surface2 }],
        ]}
      >
        {isEmpty ? (
          <DotsLoader />
        ) : (
          <Text style={[styles.text, { color: isUser ? theme.bg : theme.ink }]}>
            {displayText}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  wrapperUser: { justifyContent: 'flex-end' },
  wrapperAI:   { justifyContent: 'flex-start' },
  bubble: {
    maxWidth:        '84%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius:    18,
  },
  bubbleUser: {
    borderBottomRightRadius: 5,
  },
  bubbleAI: {
    borderBottomLeftRadius: 5,
  },
  text: {
    fontFamily:  FONTS.sansRegular,
    fontSize:    15.5,
    lineHeight:  22,
    letterSpacing: -0.1,
  },
});
