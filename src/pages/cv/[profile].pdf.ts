import type { APIRoute, GetStaticPaths } from "astro";
import { compileTypstToPDF } from "../../cv/compiler";
import { getCVCollectionsData, resolveCVProfile } from "../../cv/data";
import { cvProfiles, type CVProfileSlug } from "../../cv/profiles";
import { generateTypst } from "../../cv/typst";

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  return Object.keys(cvProfiles).map((profile) => ({
    params: { profile },
  }));
};

export const GET: APIRoute = async ({ params }) => {
  const profileSlug = params.profile as CVProfileSlug;
  const profile = cvProfiles[profileSlug];

  if (!profile) {
    return new Response(`CV profile "${params.profile}" not found.`, {
      status: 404,
    });
  }

  const collections = await getCVCollectionsData();
  const resolvedCV = resolveCVProfile(collections, profile);
  const typstSource = generateTypst(profile, resolvedCV);
  const pdfBuffer = await compileTypstToPDF(typstSource);

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rodrigo-dias-cv-${profileSlug}.pdf"`,
    },
  });
};
