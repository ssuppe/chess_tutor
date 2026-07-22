import { getAllOpenings } from '@/lib/openingTrainer/openingLoader';
import { extractFamilyName } from '@/lib/openingTrainer/openingFamilies';
import FamilyTrainingClient from './FamilyTrainingClient';

export async function generateStaticParams() {
  const openings = getAllOpenings();
  const families = Array.from(new Set(openings.map((o: any) => extractFamilyName(o.name)))) as string[];
  
  return families.map((familyName) => ({
    familyName: encodeURIComponent(familyName),
  }));
}

export default function Page() {
  return <FamilyTrainingClient />;
}
