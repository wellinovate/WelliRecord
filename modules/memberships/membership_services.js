import mongoose from "mongoose";
import {
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhone,
} from "../../shared/utils/helper.js";
import { Account } from "../accounts/account_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationMembership } from "./organization_membership_model.js";

export const searchDoctorForOrganizationService = async ({
  identifier,
  identifierType,
  organizationId,
}) => {
  console.log(
    "🚀 ~ searchDoctorForOrganizationService ~ identifierType:",
    identifierType,
  );
  console.log(
    "🚀 ~ searchDoctorForOrganizationService ~ identifier:",
    identifier,
  );
  let doctor = null;
  let doctorrole = null;
  const value = String(identifier || "").trim();

  if (identifierType === "wrId") {
    doctor = await UserProfile.findOne({ wrId: value });

    doctorrole = await Account.findOne({
      email: doctor.email,
    });
  }

  if (identifierType === "email") {
    console.log(
      "🚀 ~ searchPatientForOrganizationService ~ identifierType:",
      identifierType,
    );
    doctor = await UserProfile.findOne({
      email: normalizeEmail(value),
    });
    doctorrole = await Account.findOne({
      email: normalizeEmail(value),
    });
    console.log("🚀 ~ searchPatientForOrganizationService ~ doctor:", doctor);
  }

  if (identifierType === "phone") {
    doctor = await UserProfile.findOne({
      phone: normalizePhone(value),
    });
    doctorrole = await Account.findOne({
      phone: normalizePhone(value),
    });
  }

  // if (identifierType === "qr") {
  //   const parsed = parsePatientQrPayload(value);

  //   if (parsed?.wrId) {
  //     doctor = await PatientIdentity.findOne({ wrId: parsed.wrId });
  //   }
  // }

  if (!doctor) {
    const error = new Error("doctor not found");
    error.statusCode = 404;
    throw error;
  }

  const existingLink = await OrganizationMembership.findOne({
    userId: doctor._id,
    organizationId,
  });

  return {
    doctorIdentityId: doctor._id,
    wrId: doctor.wrId || null,
    fullName:
      doctor.fullName ||
      `${doctor.firstName || ""} ${doctor.lastName || ""}`.trim(),
    dateOfBirth: doctor.dateOfBirth || null,
    gender: doctor.gender || null,
    role: doctorrole.role,
    maskedEmail: maskEmail(doctor.email),
    maskedPhone: maskPhone(doctor.phone),
    alreadyMember: Boolean(existingLink),
  };
};

export const addDoctorToOrganizationService = async ({
  doctorIdentityId,
  organizationId,
  createdBy,
}) => {
  const doctor = await UserProfile.findById(doctorIdentityId);
  console.log("🚀 ~ linkPatientToOrganizationService ~ doctor:", doctor);
  const doctorrole = await Account.findOne({
    email: doctor.email,
  });

  if (!doctor) {
    const error = new Error("doctor not found");
    error.statusCode = 404;
    throw error;
  }

  let relation = await OrganizationMembership.findOne({
    userId: doctor._id,
    organizationId,
  });
  console.log("🚀 ~ linkPatientToOrganizationService ~ relation:", relation);

  if (relation) {
    return {
      doctorIdentityId: doctor._id,
      organizationPatientId: relation._id,
      externalDoctorId: relation.userId,
      alreadyMember: true,
    };
  }

  relation = await OrganizationMembership.create({
    organizationId,
    userId: doctor._id,
    membershipRole: doctorrole.role,
    createdBy,
  });
  console.log("🚀 ~ linkPatientToOrganizationService ~ relation:", relation);

  return {
    patientIdentityId: doctor._id,
    organizationPatientId: relation._id,
    externalPatientId: relation.externalPatientId,
    alreadyLinked: false,
  };
};

export const getDoctorsServicess = async ({
  organizationId,
  search,
  page = 1,
  limit = 10,
}) => {
  const skip = (page - 1) * limit;

  // 🔍 Build search filter
  let doctorFilter = {};

  if (search) {
    doctorFilter = {
      $or: [
        { fullName: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
      ],
    };
  }

  // 🔗 Get doctor-organization relationships
  const relations = await OrganizationMembership.find({
    organizationId,
  })
    .populate({
      path: "userId",
      select: "fullName dateOfBirth gender phone email wrId gender isLicensed",
    })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  console.log("🚀 ~ getPatientsService ~ relations:", relations);

//   const filtered = relations.filter((r) => r.patientId || r.patientIdentity);

  

//     return {
//       patientId: doctor._id,
//       fullName: doctor.fullName,
//       dateOfBirth: doctor.dateOfBirth,
//       gender: doctor.gender,
//       phone: doctor.phone,
//       email: doctor.email,

//       externalPatientId: relation.externalPatientId,
//       relationshipType: relation.relationshipType,
//       lastSeenAt: relation.lastSeenAt,

//       source: relation.patientId ? "patientId" : "patientIdentity",

//       lastVisit: encounter?.lastVisit || null,
//       encounterStatus: encounter?.status || null,
//     };
//   });

  const total = await OrganizationMembership.countDocuments({
    organizationId,
    status: "active",
  });
  console.log("🚀 ~ getDoctorsService ~ total:", total)

//   return {
//     "",
//     pagination: {
//       page,
//       limit,
//       total,
//       totalPages: Math.ceil(total / limit),
//     },
//   };
};



export const getDoctorsService = async ({
  organizationId,
  search = "",
  page = 1,
  limit = 10,
}) => {
  const parsedPage = Math.max(Number(page) || 1, 1);
  const parsedLimit = Math.max(Number(limit) || 10, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const baseMatch = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    membershipRole: "doctor",
    isActive: true,
  };

  const searchMatch = search?.trim()
    ? {
        $or: [
          { "user.fullName": { $regex: search.trim(), $options: "i" } },
          { "user.phone": { $regex: search.trim(), $options: "i" } },
          { "user.email": { $regex: search.trim(), $options: "i" } },
          { "user.wrId": { $regex: search.trim(), $options: "i" } },
        ],
      }
    : {};

  const userCollectionName = UserProfile.collection.name;

  const pipeline = [
    { $match: baseMatch },

    {
      $lookup: {
        from: userCollectionName,
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },

    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: false,
      },
    },

    ...(search?.trim() ? [{ $match: searchMatch }] : []),

    { $sort: { updatedAt: -1 } },

    {
      $facet: {
        doctors: [
          { $skip: skip },
          { $limit: parsedLimit },
          {
            $project: {
              _id: 0,
              membershipId: "$_id",
              userId: "$user._id",
              fullName: "$user.fullName",
              dateOfBirth: "$user.dateOfBirth",
              gender: "$user.gender",
              phone: "$user.phone",
              email: "$user.email",
              wrId: "$user.wrId",
              isLicensed: "$user.isLicensed",

              membershipRole: 1,
              department: 1,
              specialist: 1,
              title: 1,
              isPrimary: 1,
              isActive: 1,
              joinedAt: 1,
              updatedAt: 1,
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const result = await OrganizationMembership.aggregate(pipeline);

  const doctors = result?.[0]?.doctors || [];
  const total = result?.[0]?.totalCount?.[0]?.count || 0;

  return {
    doctors,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};
