import { redirect } from 'next/navigation';

interface CandidateJobDetailPageProps {
    params: {
        id: string;
    };
}

export default function CandidateJobDetailPage({ params }: CandidateJobDetailPageProps) {
    redirect(`/jobs/${params.id}`);
}