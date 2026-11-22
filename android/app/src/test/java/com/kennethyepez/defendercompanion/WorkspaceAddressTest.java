package com.kennethyepez.defendercompanion;

import static org.junit.Assert.*;

import org.junit.Test;

public class WorkspaceAddressTest {
  @Test
  public void normalizesOnlyAValidPrivateOrigin() {
    assertEquals(
        "https://computer.example.ts.net:18449",
        WorkspaceAddress.normalize(" https://computer.example.ts.net:18449/ "));
    assertEquals(
        "https://computer.example.ts.net",
        WorkspaceAddress.normalize("https://COMPUTER.example.ts.net:443"));
  }

  @Test
  public void rejectsCredentialsAndExecutableOrPublicLinks() {
    for (String value :
        new String[] {
          "http://computer.example.ts.net",
          "https://computer.example.ts.net.attacker.invalid",
          "javascript:alert(1)",
          "file:///data/local/tmp/a",
          "https://user:pass@computer.example.ts.net",
          "https://computer.example.ts.net/?token=secret",
          "https://computer.example.ts.net/#secret",
          "https://computer.example.ts.net/../",
          "https://127.0.0.1",
          "https://computer.example.ts.net:22",
          "https://computer.example.ts.net:65536",
          "https://computer.example.ts.net\\@evil.invalid",
          "https://computer.example.ts.net/%2e%2e",
          "intent://a",
          "https://evil.invalid"
        }) {
      try {
        WorkspaceAddress.normalize(value);
        fail(value);
      } catch (IllegalArgumentException expected) {
      }
    }
  }
}
