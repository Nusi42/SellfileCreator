# Flex `emitMinOnly` Redundancy Note

## Context
- Config: builder config 79 (flex weapon SPD/ACC/CDMG with RES wildcard).
- Rules of interest: preview lines 14130 and 14132 in generated HSF.
- Code paths: `buildHsfRules` in `src/lib/hsfBuilder.ts`, especially the flex branch (`autoSubstatFlex`) that calls `emitMinOnly` (around `src/lib/hsfBuilder.ts:1318`).
config 79:
{
  "configNumber": 79,
  "name": "",
  "builderConfig": {
    "name": "",
    "keep": true,
    "enabled": true,
    "rankCode": 0,
    "rarityCode": 0,
    "rarityMode": "auto",
    "factionCode": 0,
    "mainStatsV": [],
    "rollBaseline": "afterStart",
    "rollMode": "potential",
    "earlyKeepMode": "late",
    "substatsV": [
      1025,
      1537,
      1281,
      2048
    ],
    "fixedSubstatsV": [
      1537,
      1025
    ],
    "minCount": 3,
    "autoMinCount": false,
    "autoSubstatFlex": true,
    "minRequiredRolls": 3,
    "autoMinRequiredRolls": false,
    "minLevel": 0,
    "maxLevel": 16,
    "artifactTypes": [
      5
    ],
    "artifactSets": [],
    "substatRollBoundsV": {
      "1025": {
        "min": 2
      },
      "1281": {
        "any": true
      },
      "1537": {
        "min": 1
      },
      "2048": {
        "max": 0
      }
    },
    "autoRaritySupplementsThreshold": "epic"
  },
  "readableConfig": {
    "__cfgIdx_ignoredWhenRead": 79,
    "name": "",
    "keep": true,
    "enabled": true,
    "Rank": "Any",
    "Rarity": "Auto",
    "Faction": "Any",
    "mainStats": [],
    "minLevel": 0,
    "maxLevel": 16,
    "earlyKeepMode": "late",
    "substats": [
      "SPD",
      "CDMG%",
      "ACC",
      "RES"
    ],
    "fixedSubstats": [
      "SPD",
      "ACC"
    ],
    "autoRarityThreshold": "epic",
    "substatRollBounds": {
      "SPD": {
        "min": 2
      },
      "RES": {
        "any": true
      },
      "ACC": {
        "min": 1
      },
      "CDMG%": {
        "max": 0
      }
    },
    "minCount": 3,
    "autoMinCount": false,
    "autoSubstatFlex": true,
    "minRequiredRolls": 3,
    "autoMinRequiredRolls": false,
    "artifactTypeNames": [
      "Weapon"
    ],
    "artifactSetNames": [],
    "artifactMetaSetIds": []
  },
  "previewLines": [
    14094,
    14095,
    14096,
    14097,
    14098,
    14099,
    14100,
    14101,
    14102,
    14103,
    14104,
    14105,
    14106,
    14107,
    14108,
    14109,
    14110,
    14111,
    14112,
    14113,
    14114,
    14115,
    14116,
    14117,
    14118,
    14119,
    14120,
    14121,
    14122,
    14123,
    14124,
    14125,
    14126,
    14127,
    14128,
    14129,
    14130,
    14131,
    14132
  ],
  "rules": [
    {
      "line": 14094,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 0,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14095,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 0,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14096,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 4,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14097,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 4,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14098,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14099,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14100,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14101,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14102,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14103,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14104,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14105,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14106,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14107,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14108,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14109,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14110,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14111,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 5,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14112,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14113,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14114,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 8,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14115,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14116,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14117,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14118,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 20,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14119,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14120,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14121,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14122,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14123,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 20,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14124,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14125,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14126,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 10,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 27,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14127,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14128,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14129,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 16,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 12,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 20,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    },
    {
      "line": 14130,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 16,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14131,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 16,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": -1,
            "Value": 0,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ""
          }
        ]
      }
    },
    {
      "line": 14132,
      "rule": {
        "Keep": true,
        "IsRuleTypeAND": false,
        "Use": true,
        "ArtifactType": [
          5
        ],
        "Rank": 0,
        "Rarity": 9,
        "MainStatID": -1,
        "MainStatF": 1,
        "LVLForCheck": 16,
        "Faction": 0,
        "Substats": [
          {
            "ID": 4,
            "Value": 15,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 6,
            "Value": 18,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 8,
            "Value": 5,
            "IsFlat": false,
            "NotAvailable": false,
            "Condition": ">="
          },
          {
            "ID": 5,
            "Value": 9,
            "IsFlat": true,
            "NotAvailable": false,
            "Condition": ">="
          }
        ]
      }
    }
  ]
}

## Observation
- Line 14130 keeps `SPD 15`, `ACC 18`, `CDMG% 5` at level 16. Any optional fourth substat can be baseline; matcher stops at this rule.
- Line 14132 adds `RES 9` but otherwise duplicates 14130. Because 14130 matches first, 14132 is never reached; it is redundant.

## Cause
- In flex mode the builder enumerates supersets of the minimum combo when optional stats exist.
- For level 16 the combo `[SPD, ACC, CDMG]` (line 14130) and the supersized combo `[SPD, ACC, CDMG, RES]` (line 14132) both reach feasibility.
- When `emitMinOnly` runs (`src/lib/hsfBuilder.ts:1318`), it emits thresholds for all stats in the combo without checking whether optional stats sit at their baseline.
- Result: any flex combo that only lifts required stats while leaving optional stats untouched still produces an extra rule, even though the smaller combo already covers the scenario.

## Follow-Up Ideas
1. Tighten `emitMinOnly` so supersized combos are skipped when every optional stat remains at its base minimum. That would remove rows like 14132 without affecting coverage.
2. Alternatively collect and prune dominated rules after generation, but adjusting `emitMinOnly` is likely cheaper and keeps the emission logic self-consistent.

Documenting now for future cleanup.
