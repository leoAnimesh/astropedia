/**
 * Built-in recommendation types. Each file self-registers on import.
 * To add a new type: create `<type>.ts(x)` calling registerRecommendation()
 * and add one import line here.
 */
import './fallback';
import './gemstone';
import './tarot';
import './consultation';
import './article';
import './promotion';
import './remedy';
