import * as pub from "./modules/catalog/public";
import * as batch from "./modules/catalog/admin-routes/catalog-batch";
import * as assets from "./modules/assets/routes";
/** 全部业务接口的静态路由表。 */
import * as r0 from "./modules/auth/admin-routes/accounts-id-role";
import * as r1 from "./modules/auth/admin-routes/accounts";
import * as r2 from "./modules/admin/admin-routes/audit";
import * as r3 from "./modules/admin/admin-routes/campaign-menu";
import * as r4 from "./modules/catalog/admin-routes/campaigns-id-challenge-order";
import * as r5 from "./modules/catalog/admin-routes/campaigns-id-layout";
import * as r6 from "./modules/catalog/admin-routes/catalog-maps-batch";
import * as r7 from "./modules/catalog/admin-routes/catalog";
import * as r8 from "./modules/catalog/admin-routes/challenges-id-merge";
import * as r9 from "./modules/catalog/admin-routes/challenges-id-split";
import * as r10 from "./modules/feedback/admin-routes/feedback-id";
import * as r11 from "./modules/tracker/admin-routes/golden-room-rules";
import * as r12 from "./modules/tracker/admin-routes/map-bindings-batch";
import * as r13 from "./modules/tracker/admin-routes/map-bindings";
import * as r14 from "./modules/catalog/admin-routes/maps-id-order";
import * as r15 from "./modules/catalog/admin-routes/maps-id-relations";
import * as r16 from "./modules/players/admin-routes/player-bindings-preview";
import * as r17 from "./modules/players/admin-routes/player-bindings";
import * as r18 from "./modules/players/admin-routes/player-claims-id";
import * as r19 from "./modules/players/admin-routes/player-claims";
import * as r20 from "./modules/players/admin-routes/players-id";
import * as r21 from "./modules/players/admin-routes/players-id-unlink";
import * as r22 from "./modules/players/admin-routes/players";
import * as r23 from "./modules/qa/admin-routes/qa";
import * as r24 from "./modules/records/admin-routes/submissions-id-review";
import * as r25 from "./modules/records/admin-routes/submissions-id-reviewing";
import * as r26 from "./modules/records/admin-routes/submissions-id";
import * as r27 from "./modules/records/admin-routes/submissions-id-tags";
import * as r28 from "./modules/records/admin-routes/submissions";
import * as r29 from "./modules/suggestions/admin-routes/suggestions-id-decide";
import * as r30 from "./modules/suggestions/admin-routes/suggestions-id-duration";
import * as r31 from "./modules/suggestions/admin-routes/suggestions-id";
import * as r32 from "./modules/admin/admin-routes/tasks-id";
import * as r33 from "./modules/admin/admin-routes/tasks";
import * as r34 from "./modules/admin/admin-routes/trash-id";
import * as r35 from "./modules/admin/admin-routes/trash";
import * as r36 from "./modules/auth/routes/auth-account";
import * as r37 from "./modules/auth/routes/auth-callback-provider";
import * as r38 from "./modules/auth/routes/auth-claim";
import * as r39 from "./modules/auth/routes/auth-claim-requests";
import * as r40 from "./modules/auth/routes/auth-email-verify";
import * as r41 from "./modules/auth/routes/auth-identity-provider";
import * as r42 from "./modules/auth/routes/auth-login-provider";
import * as r43 from "./modules/auth/routes/auth-login";
import * as r44 from "./modules/auth/routes/auth-logout";
import * as r45 from "./modules/auth/routes/auth-methods";
import * as r46 from "./modules/auth/routes/auth-password-forgot";
import * as r47 from "./modules/auth/routes/auth-password-reset";
import * as r48 from "./modules/auth/routes/auth-password";
import * as r49 from "./modules/auth/routes/auth-preferences";
import * as r50 from "./modules/auth/routes/auth-register";
import * as r51 from "./modules/auth/routes/auth-session";
import * as r52 from "./modules/catalog/routes/catalog";
import * as r53 from "./modules/feedback/routes/feedback-attachments";
import * as r54 from "./modules/feedback/routes/feedback";
import * as r55 from "./modules/catalog/routes/hist";
import * as r56 from "./modules/tracker/routes/online";
import * as r57 from "./modules/players/routes/players-id-avatar";
import * as r58 from "./modules/players/routes/players-id-presence";
import * as r59 from "./modules/records/routes/submissions-id-opinion";
import * as r60 from "./modules/records/routes/submissions-id";
import * as r61 from "./modules/records/routes/submissions";
import * as r62 from "./modules/suggestions/routes/suggestions-id-response";
import * as r63 from "./modules/suggestions/routes/suggestions";
import * as r64 from "./modules/tracker/routes/tracker-area-stats";
import * as r65 from "./modules/tracker/routes/tracker-authorizations";
import * as r66 from "./modules/tracker/routes/tracker-cct-baseline";
import * as r67 from "./modules/tracker/routes/tracker-cct-change";
import * as r68 from "./modules/tracker/routes/tracker-cct-state";
import * as r69 from "./modules/tracker/routes/tracker-config";
import * as r70 from "./modules/tracker/routes/tracker-devices-id";
import * as r71 from "./modules/tracker/routes/tracker-devices";
import * as r72 from "./modules/tracker/routes/tracker-devices-token";
import * as r73 from "./modules/tracker/routes/tracker-map-binding";
import * as r74 from "./modules/tracker/routes/tracker-overlay-context";
import * as r75 from "./modules/tracker/routes/tracker-preferences";
import * as r76 from "./modules/tracker/routes/tracker-presence";
import * as r77 from "./modules/tracker/routes/tracker-stats";
import * as r78 from "./modules/wishlist/routes/wishlist";
export const routes = [
  { method: "GET", url: "/api/tracker/config", handler: r69.GET },
  { method: "POST", url: "/api/tracker/config", handler: r69.POST },
  { method: "POST", url: "/api/admin/catalog/batch", handler: batch.POST },
  { method: "POST", url: "/api/admin/assets", handler: assets.POST },
  { method: "GET", url: "/api/campaigns", handler: pub.campaigns },
  { method: "GET", url: "/api/maps", handler: pub.maps },
  { method: "GET", url: "/api/players", handler: pub.players },
  { method: "GET", url: "/api/challenges", handler: pub.challenges },
  { method: "GET", url: "/api/records", handler: pub.records },
  { method: "GET", url: "/api/stats", handler: pub.stats },
  { method: "GET", url: "/api/suggestions", handler: pub.suggestions },
  { method: "GET", url: "/api/qa", handler: pub.qa },
  { method: "GET", url: "/api/farewell", handler: pub.farewell },
  { method: "GET", url: "/api/campaigns/:id", handler: pub.campaign },
  { method: "GET", url: "/api/maps/:id", handler: pub.map },
  { method: "GET", url: "/api/players/:id", handler: pub.player },
  { method: "GET", url: "/api/challenges/:id", handler: pub.challenge },
  { method: "GET", url: "/api/records/:id", handler: pub.record },

  { method: "PATCH", url: "/api/admin/accounts/:id/role", handler: r0.PATCH },
  { method: "GET", url: "/api/admin/accounts", handler: r1.GET },
  { method: "GET", url: "/api/admin/audit", handler: r2.GET },
  { method: "PUT", url: "/api/admin/campaign-menu", handler: r3.PUT },
  { method: "PUT", url: "/api/admin/campaigns/:id/challenge-order", handler: r4.PUT },
  { method: "PUT", url: "/api/admin/campaigns/:id/layout", handler: r5.PUT },
  { method: "POST", url: "/api/admin/catalog/maps/batch", handler: r6.POST },
  { method: "POST", url: "/api/admin/catalog", handler: r7.POST },
  { method: "PUT", url: "/api/admin/catalog", handler: r7.PUT },
  { method: "POST", url: "/api/admin/challenges/:id/merge", handler: r8.POST },
  { method: "POST", url: "/api/admin/challenges/:id/split", handler: r9.POST },
  { method: "PATCH", url: "/api/admin/feedback/:id", handler: r10.PATCH },
  { method: "GET", url: "/api/admin/golden-room-rules", handler: r11.GET },
  { method: "POST", url: "/api/admin/golden-room-rules", handler: r11.POST },
  { method: "POST", url: "/api/admin/map-bindings/batch", handler: r12.POST },
  { method: "GET", url: "/api/admin/map-bindings", handler: r13.GET },
  { method: "PATCH", url: "/api/admin/map-bindings", handler: r13.PATCH },
  { method: "PUT", url: "/api/admin/maps/:id/order", handler: r14.PUT },
  { method: "PUT", url: "/api/admin/maps/:id/relations", handler: r15.PUT },
  { method: "GET", url: "/api/admin/player-bindings/preview", handler: r16.GET },
  { method: "POST", url: "/api/admin/player-bindings/preview", handler: r16.POST },
  { method: "POST", url: "/api/admin/player-bindings", handler: r17.POST },
  { method: "POST", url: "/api/admin/player-claims/:id", handler: r18.POST },
  { method: "GET", url: "/api/admin/player-claims", handler: r19.GET },
  { method: "PATCH", url: "/api/admin/players/:id", handler: r20.PATCH },
  { method: "POST", url: "/api/admin/players/:id/unlink", handler: r21.POST },
  { method: "GET", url: "/api/admin/players", handler: r22.GET },
  { method: "POST", url: "/api/admin/players", handler: r22.POST },
  { method: "POST", url: "/api/admin/qa", handler: r23.POST },
  { method: "POST", url: "/api/admin/submissions/:id/review", handler: r24.POST },
  { method: "POST", url: "/api/admin/submissions/:id/reviewing", handler: r25.POST },
  { method: "GET", url: "/api/admin/submissions/:id", handler: r26.GET },
  { method: "PATCH", url: "/api/admin/submissions/:id", handler: r26.PATCH },
  { method: "POST", url: "/api/admin/submissions/:id/tags", handler: r27.POST },
  { method: "GET", url: "/api/admin/submissions", handler: r28.GET },
  { method: "POST", url: "/api/admin/submissions", handler: r28.POST },
  { method: "POST", url: "/api/admin/suggestions/:id/decide", handler: r29.POST },
  { method: "POST", url: "/api/admin/suggestions/:id/duration", handler: r30.POST },
  { method: "DELETE", url: "/api/admin/suggestions/:id", handler: r31.DELETE },
  { method: "PATCH", url: "/api/admin/tasks/:id", handler: r32.PATCH },
  { method: "GET", url: "/api/admin/tasks", handler: r33.GET },
  { method: "POST", url: "/api/admin/tasks", handler: r33.POST },
  { method: "POST", url: "/api/admin/trash/:id", handler: r34.POST },
  { method: "GET", url: "/api/admin/trash", handler: r35.GET },
  { method: "POST", url: "/api/admin/trash", handler: r35.POST },
  { method: "PATCH", url: "/api/auth/account", handler: r36.PATCH },
  { method: "GET", url: "/api/auth/callback/:provider", handler: r37.GET },
  { method: "GET", url: "/api/auth/claim", handler: r38.GET },
  { method: "POST", url: "/api/auth/claim", handler: r38.POST },
  { method: "GET", url: "/api/auth/claim-requests", handler: r39.GET },
  { method: "POST", url: "/api/auth/claim-requests", handler: r39.POST },
  { method: "GET", url: "/api/auth/email/verify", handler: r40.GET },
  { method: "POST", url: "/api/auth/email/verify", handler: r40.POST },
  { method: "DELETE", url: "/api/auth/identity/:provider", handler: r41.DELETE },
  { method: "GET", url: "/api/auth/login/:provider", handler: r42.GET },
  { method: "POST", url: "/api/auth/login", handler: r43.POST },
  { method: "POST", url: "/api/auth/logout", handler: r44.POST },
  { method: "GET", url: "/api/auth/methods", handler: r45.GET },
  { method: "POST", url: "/api/auth/password/forgot", handler: r46.POST },
  { method: "POST", url: "/api/auth/password/reset", handler: r47.POST },
  { method: "POST", url: "/api/auth/password", handler: r48.POST },
  { method: "PATCH", url: "/api/auth/preferences", handler: r49.PATCH },
  { method: "POST", url: "/api/auth/register", handler: r50.POST },
  { method: "GET", url: "/api/auth/session", handler: r51.GET },
  { method: "GET", url: "/api/catalog", handler: r52.GET },
  { method: "POST", url: "/api/feedback/attachments", handler: r53.POST },
  { method: "DELETE", url: "/api/feedback/attachments", handler: r53.DELETE },
  { method: "POST", url: "/api/feedback", handler: r54.POST },
  { method: "GET", url: "/api/hist", handler: r55.GET },
  { method: "GET", url: "/api/online", handler: r56.GET },
  { method: "GET", url: "/api/players/:id/avatar", handler: r57.GET },
  { method: "POST", url: "/api/players/:id/avatar", handler: r57.POST },
  { method: "GET", url: "/api/players/:id/presence", handler: r58.GET },
  { method: "PATCH", url: "/api/submissions/:id/opinion", handler: r59.PATCH },
  { method: "PATCH", url: "/api/submissions/:id", handler: r60.PATCH },
  { method: "DELETE", url: "/api/submissions/:id", handler: r60.DELETE },
  { method: "GET", url: "/api/submissions", handler: r61.GET },
  { method: "POST", url: "/api/submissions", handler: r61.POST },
  { method: "POST", url: "/api/suggestions/:id/response", handler: r62.POST },
  { method: "GET", url: "/api/suggestions/:id/response", handler: r62.GET },
  { method: "POST", url: "/api/suggestions", handler: r63.POST },
  { method: "POST", url: "/api/tracker/area-stats", handler: r64.POST },
  { method: "POST", url: "/api/tracker/authorizations", handler: r65.POST },
  { method: "POST", url: "/api/tracker/cct/baseline", handler: r66.POST },
  { method: "POST", url: "/api/tracker/cct/change", handler: r67.POST },
  { method: "POST", url: "/api/tracker/cct/state", handler: r68.POST },
  { method: "DELETE", url: "/api/tracker/devices/:id", handler: r70.DELETE },
  { method: "GET", url: "/api/tracker/devices", handler: r71.GET },
  { method: "POST", url: "/api/tracker/devices/token", handler: r72.POST },
  { method: "GET", url: "/api/tracker/map-binding", handler: r73.GET },
  { method: "POST", url: "/api/tracker/map-binding", handler: r73.POST },
  { method: "GET", url: "/api/tracker/overlay-context", handler: r74.GET },
  { method: "PATCH", url: "/api/tracker/preferences", handler: r75.PATCH },
  { method: "DELETE", url: "/api/tracker/preferences", handler: r75.DELETE },
  { method: "POST", url: "/api/tracker/presence", handler: r76.POST },
  { method: "GET", url: "/api/tracker/presence", handler: r76.GET },
  { method: "GET", url: "/api/tracker/stats", handler: r77.GET },
  { method: "GET", url: "/api/wishlist", handler: r78.GET },
  { method: "POST", url: "/api/wishlist", handler: r78.POST },
  { method: "PATCH", url: "/api/wishlist", handler: r78.PATCH },
  { method: "DELETE", url: "/api/wishlist", handler: r78.DELETE },
] as const;
