package com.kennethyepez.defendercompanion;

import java.net.URI;
import java.util.Locale;

/** A connection address, never a token or an arbitrary browser/deep link. */
public final class WorkspaceAddress {
  private WorkspaceAddress() {}

  public static String normalize(String input) {
    if (input == null || input.length() > 256)
      throw new IllegalArgumentException("Enter a private HTTPS workspace address.");
    try {
      URI uri = new URI(input.trim());
      String host = uri.getHost();
      int port = uri.getPort();
      if (!"https".equalsIgnoreCase(uri.getScheme())
          || host == null
          || !host.toLowerCase(Locale.ROOT)
              .matches("[a-z0-9][a-z0-9-]*\\.[a-z0-9][a-z0-9-]*\\.ts\\.net")
          || uri.getRawUserInfo() != null
          || uri.getRawQuery() != null
          || uri.getRawFragment() != null
          || !(uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"))
          || !(port == -1 || port == 443 || port >= 1024 && port <= 65535))
        throw new IllegalArgumentException();
      return "https://"
          + host.toLowerCase(Locale.ROOT)
          + (port == -1 || port == 443 ? "" : ":" + port);
    } catch (Exception ignored) {
      throw new IllegalArgumentException(
          "Use an HTTPS .ts.net address without a path, query or sign-in token.");
    }
  }
}
