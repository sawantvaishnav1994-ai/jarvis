import { PersonalHome } from "./home/home";
export const dynamic = "force-dynamic";
export default function Page() {
    return (
        <PersonalHome
            identityHref={
                process.env.JARVIS_REMOTE_ORIGIN
                    ? "/remote-identity"
                    : "/identity"
            }
        />
    );
}
