// ─────────────────────────────────────────────────────────────────────────────
// Example 6: Router — compiled TypeScript equivalent of App.jalvin
//
// This is what the Jalvin compiler emits. You can also write this directly
// if you prefer working in TypeScript.
// ─────────────────────────────────────────────────────────────────────────────

import {
  jalvinCreateElement,
  render,
  MutableStateFlow,
  ViewModel,
  collectAsState,
  remember,
  NavController,
  NavGraphBuilder,
  NavHost,
  NavOptions,
  rememberNavController,
  type BackStackEntry,
} from "@jalvin/runtime";
import { Column, Row, Text, Button, Surface, Spacer, Modifier, TextStyle } from "@jalvin/ui";

// ── ViewModels ────────────────────────────────────────────────────────────────

class FeedViewModel extends ViewModel {
  readonly posts = new MutableStateFlow<string[]>([
    "Jalvin ships declarative routing",
    "VNode diffing is fast",
    "Coroutines make async easy",
  ]);
}

class PostViewModel extends ViewModel {
  readonly liked = new MutableStateFlow(false);

  toggleLike() {
    this.liked.update((it) => !it);
  }
}

// Helper: look up a ViewModel by key (mirrors useViewModel in .jalvin)
function useViewModel<T extends ViewModel>(key: string, factory: () => T): T {
  return remember(() => {
    const vm = factory();
    return vm;
  }, [key]) as T;
}

// ── Screens ───────────────────────────────────────────────────────────────────

function HomeScreen({ navController }: { navController: NavController }) {
  const vm = useViewModel("feed", () => new FeedViewModel());
  const posts = collectAsState(vm.posts);

  return jalvinCreateElement(Column, { modifier: Modifier.fillMaxWidth().padding(24), spacing: 16 }, [
    jalvinCreateElement(Text, { text: "Feed", style: TextStyle.headlineMedium }),
    ...posts.map((post, index) =>
      jalvinCreateElement(Surface, { modifier: Modifier.fillMaxWidth().padding(12) }, [
        jalvinCreateElement(Row, { spacing: 12 }, [
          jalvinCreateElement(Text, { text: post, modifier: Modifier.weight(1) }),
          jalvinCreateElement(Button, {
            text: "Read",
            variant: "outlined",
            onClick: () => navController.navigate(`post/${index}`),
          }),
        ]),
      ])
    ),
    jalvinCreateElement(Row, { spacing: 8 }, [
      jalvinCreateElement(Button, {
        text: "Profile",
        variant: "filled",
        onClick: () => navController.navigate("profile/me"),
      }),
      jalvinCreateElement(Button, {
        text: "Settings",
        variant: "text",
        onClick: () => navController.navigate("settings"),
      }),
    ]),
  ]);
}

function PostScreen({
  navController,
  entry,
}: {
  navController: NavController;
  entry: BackStackEntry;
}) {
  const postId = entry.arguments["postId"] ?? "?";
  const vm = useViewModel(`post-${postId}`, () => new PostViewModel());
  const liked = collectAsState(vm.liked);

  return jalvinCreateElement(Column, { modifier: Modifier.fillMaxWidth().padding(24), spacing: 16 }, [
    jalvinCreateElement(Text, { text: `Post #${postId}`, style: TextStyle.headlineMedium }),
    jalvinCreateElement(Text, { text: `This is the full content of post ${postId}.` }),
    jalvinCreateElement(Row, { spacing: 8 }, [
      jalvinCreateElement(Button, {
        text: liked ? "♥ Liked" : "♡ Like",
        variant: liked ? "filled" : "outlined",
        onClick: () => vm.toggleLike(),
      }),
      jalvinCreateElement(Spacer, { modifier: Modifier.weight(1) }),
      jalvinCreateElement(Button, {
        text: "← Back",
        variant: "text",
        onClick: () => navController.popBackStack(),
      }),
    ]),
  ]);
}

function ProfileScreen({
  navController,
  entry,
}: {
  navController: NavController;
  entry: BackStackEntry;
}) {
  const userId = entry.arguments["userId"] ?? "unknown";

  return jalvinCreateElement(Column, { modifier: Modifier.fillMaxWidth().padding(24), spacing: 16 }, [
    jalvinCreateElement(Text, { text: `Profile: ${userId}`, style: TextStyle.headlineMedium }),
    jalvinCreateElement(Text, { text: `User ID: ${userId}` }),
    jalvinCreateElement(Row, { spacing: 8 }, [
      jalvinCreateElement(Button, {
        text: "Settings",
        variant: "outlined",
        onClick: () => navController.navigate("settings"),
      }),
      jalvinCreateElement(Spacer, { modifier: Modifier.weight(1) }),
      jalvinCreateElement(Button, {
        text: "← Back",
        variant: "text",
        onClick: () => navController.popBackStack(),
      }),
    ]),
  ]);
}

function SettingsScreen({ navController }: { navController: NavController }) {
  return jalvinCreateElement(Column, { modifier: Modifier.fillMaxWidth().padding(24), spacing: 16 }, [
    jalvinCreateElement(Text, { text: "Settings", style: TextStyle.headlineMedium }),
    jalvinCreateElement(Text, { text: "App version: 0.6.0" }),
    jalvinCreateElement(Button, {
      text: "← Home",
      variant: "text",
      // popUpTo "home" without inclusive keeps "home" on the stack, so back still works
      onClick: () =>
        navController.navigate("home", { popUpTo: "home", popUpToInclusive: false }),
    }),
  ]);
}

// ── App root ──────────────────────────────────────────────────────────────────

function App() {
  const nav = rememberNavController();

  // NavHost receives:
  //   props: { navController, startDestination }
  //   children: [(graph: NavGraphBuilder) => void]  ← the DSL block
  return jalvinCreateElement(
    NavHost,
    { navController: nav, startDestination: "home" },
    [
      (graph: NavGraphBuilder) => {
        graph.composable("home", () =>
          jalvinCreateElement(HomeScreen, { navController: nav })
        );
        graph.composable("post/{postId}", (entry) =>
          jalvinCreateElement(PostScreen, { navController: nav, entry })
        );
        graph.composable("profile/{userId}", (entry) =>
          jalvinCreateElement(ProfileScreen, { navController: nav, entry })
        );
        graph.composable("settings", (entry) =>
          jalvinCreateElement(SettingsScreen, { navController: nav })
        );
      },
    ]
  );
}

// Mount
const root = document.getElementById("root");
if (root) render(App, root);
