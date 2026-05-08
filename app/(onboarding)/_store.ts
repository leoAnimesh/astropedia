// Simple module-level store for onboarding wizard state
// (not persisted — discarded if user leaves app mid-onboarding)
const OnboardingStore: {
  name: string;
  birthDate: string;
  birthTime: string;
  // location
  countryCode: string;
  countryName: string;
  stateCode: string;
  stateName: string;
  cityName: string;
  birthLat: number | null;
  birthLng: number | null;
} = {
  name:        '',
  birthDate:   '',
  birthTime:   '',
  countryCode: '',
  countryName: '',
  stateCode:   '',
  stateName:   '',
  cityName:    '',
  birthLat:    null,
  birthLng:    null,
};

export default OnboardingStore;
